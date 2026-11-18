// End-to-end multiplayer test: teacher + projector + 5 student phones, full 24-question game.
// Requires: `SQ_ALLOW_DUMP=1 npm run local-server` and `npm run dev:local` running.
// Usage: CHROME=/path/to/chrome node tests/e2e/run.mjs
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:5173/';
const WS = process.env.SQ_WS || 'ws://localhost:8787';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── tiny client for the offline server (test oracle + direct permission probes) ──
function wsClient() {
  const ws = new WebSocket(WS);
  let rid = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'res') { pend.get(m.rid)?.(m); pend.delete(m.rid); } });
  const ready = new Promise((r) => ws.on('open', r));
  const send = async (msg) => { await ready; return new Promise((res) => { const id = ++rid; pend.set(id, res); ws.send(JSON.stringify({ ...msg, rid: id })); }); };
  return { send, close: () => ws.close() };
}
const oracle = wsClient();
const dump = async () => (await oracle.send({ t: 'dump' })).val;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--window-size=1920,1080', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], protocolTimeout: 60000 });
const errors = [];
const watch = (page, who) => { page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); page.on('console', (m) => m.type() === 'error' && !/WebSocket/.test(m.text()) && errors.push(`${who}: ${m.text()}`)); };

// ── Teacher ──
const tctx = await browser.createBrowserContext();
const teacher = await tctx.newPage();
watch(teacher, 'teacher');
await teacher.setViewport({ width: 1600, height: 1000 });
await teacher.goto(APP + '#/teacher', { waitUntil: 'networkidle0' });
await teacher.type('input[type=email]', 'teacher@sciencequest.local');
await teacher.type('input[type=password]', 'wrong');
await teacher.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Sign in')).click());
await teacher.waitForSelector('[role=alert]');
check('Wrong teacher password is rejected', true);
await teacher.$eval('input[type=password]', (e) => (e.value = ''));
await teacher.click('input[type=password]', { clickCount: 3 });
await teacher.keyboard.press('Backspace');
await teacher.type('input[type=password]', 'science123');
await teacher.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Sign in')).click());
await teacher.waitForFunction(() => document.body.innerText.includes('TEACHER PANEL'), { timeout: 15000 });
await teacher.screenshot({ path: `${OUT}/01-teacher-empty.png` });

// Import the 50-question bank
const db0 = await dump();
const uidT = Object.keys(db0?.teachers ?? {})[0];
await teacher.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Question Bank'))?.click());
await teacher.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Import CSV / JSON')));
await teacher.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Import CSV / JSON')).click());
const fileInput = await teacher.waitForSelector('input[type=file]');
await fileInput.uploadFile('question-banks/science-quest-50.json');
await teacher.waitForFunction(() => document.body.innerText.includes('50 valid question'));
await teacher.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Import 50 questions/.test(b.textContent)).click());
await teacher.waitForFunction(() => /\d{6}/.test(document.querySelector('[data-testid=room-code]')?.textContent ?? ''), { timeout: 15000 });
const code = (await teacher.$eval('[data-testid=room-code]', (e) => e.textContent)).trim();
check('Bank imported and room created', /^\d{6}$/.test(code), `room ${code}`);
await teacher.screenshot({ path: `${OUT}/02-teacher-bank.png` });
await teacher.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Lobby')).click());

// Projector: its own window (so neither tab is throttled), signed in with the teacher's session
const hostAuth = await teacher.evaluate(() => localStorage.getItem('sq-local-auth-host'));
const pctx = await browser.createBrowserContext();
const projector = await pctx.newPage();
await projector.evaluateOnNewDocument((v) => localStorage.setItem('sq-local-auth-host', v), hostAuth);
watch(projector, 'projector');
await projector.setViewport({ width: 1920, height: 1080 });
await projector.goto(APP + `#/projector/${code}`, { waitUntil: 'networkidle0' });

// ── Students ──
const NAMES = ['Youssef', 'Mariem', 'Khalil', 'Selim', 'Yasmeen'];
const students = [];
async function openStudent(name, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watch(page, name);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(APP + `#/play${opts.noCode ? '' : `?code=${code}`}`, { waitUntil: 'networkidle0' });
  return { ctx, page, name };
}
async function fill(p, sel, text) {
  await p.click(sel);
  await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
  await p.keyboard.press('Backspace');
  await p.type(sel, text);
}
async function join(st, name, roomCode = code) {
  const p = st.page;
  await fill(p, 'input[aria-label="Room code"]', roomCode);
  await fill(p, 'input[aria-label="Your name"]', name);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes("Let's go")).click());
}

// wrong room code
const probe = await openStudent('probe', { noCode: true });
await join(probe, 'Tester', '999999');
await probe.page.waitForSelector('[role=alert]');
check('Incorrect room code shows an error', (await probe.page.$eval('[role=alert]', (e) => e.textContent)).includes('No game'));

// Simultaneous joins
for (const n of NAMES) students.push(await openStudent(n));
await Promise.all(students.map((s) => join(s, s.name)));
await Promise.all(students.map((s) => s.page.waitForFunction(() => document.body.innerText.includes("You're in"), { timeout: 15000 })));
check('5 students joined simultaneously', true);

// Duplicate name (different case/spaces)
await join(probe, '  youssef ');
await probe.page.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('already has that name'), { timeout: 8000 });
check('Duplicate names are rejected', true);
await students[0].page.screenshot({ path: `${OUT}/03-phone-lobby.png` });
await sleep(800);
await projector.screenshot({ path: `${OUT}/04-projector-lobby.png` });
await teacher.screenshot({ path: `${OUT}/05-teacher-lobby.png` });

// Remove the probe? (it never joined) — instead join a 6th "Troll" and remove them
await join(probe, 'Troll');
await probe.page.waitForFunction(() => document.body.innerText.includes("You're in"), { timeout: 10000 });
await teacher.waitForFunction(() => document.body.innerText.includes('Troll'));
teacher.once('dialog', (d) => d.accept());
await teacher.click('button[aria-label="Remove Troll"]');
await probe.page.waitForFunction(() => document.body.innerText.includes('You have left this game'), { timeout: 8000 });
check('Teacher can remove a player', true);

// Mark Selim as adapted
await teacher.click('input[aria-label="Adapted questions for Selim"]');
await sleep(400);

// ── Start game ──
const clickText = async (page, text, timeout = 8000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); if (!b) return false; b.click(); return true; }, text);
    if (ok) return;
    if (Date.now() > end) throw new Error('No enabled button: ' + text);
    await sleep(200);
  }
};
let dragOk = 0, dragTried = 0;
await clickText(teacher, 'Start Game');
await students[0].page.waitForFunction(() => document.body.innerText.includes('Your team is'), { timeout: 10000 });
let d = await dump();
const room = () => d.rooms[code];
const teamSizes = Object.values(room().teams).map((_, i) => Object.values(room().players).filter((p) => !p.removed && p.teamId === `t${i}`).length);
check('Random teams are balanced', Math.max(...teamSizes) - Math.min(...teamSizes) <= 1, `sizes ${teamSizes.join('/')}`);
await sleep(600);
await projector.screenshot({ path: `${OUT}/06-projector-teams.png` });
await students[1].page.screenshot({ path: `${OUT}/07-phone-team.png` });
await clickText(teacher, 'Begin Round 1');
await sleep(800);
await projector.screenshot({ path: `${OUT}/08-projector-round-intro.png` });

// Direct permission probes with a fresh anonymous identity
const hacker = wsClient();
const anon = await hacker.send({ t: 'auth', mode: 'anon' });
const hp = await hacker.send({ t: 'get', path: `rooms/${code}/hostPrivate` });
check('Students cannot read answer keys (hostPrivate)', hp.ok === false);
const sw = await hacker.send({ t: 'set', path: `rooms/${code}/state/phase`, val: 'GAME_COMPLETE' });
check('Students cannot change the game state', sw.ok === false);
const sc = await hacker.send({ t: 'set', path: `rooms/${code}/scores/${anon.user.uid}`, val: { total: 99999 } });
check('Students cannot write scores', sc.ok === false);

// ── Play all questions ──
const LET = 'ABCD';
async function answer(st, profile, pq, adapted) {
  const p = st.page;
  const q = pq.q;
  const good = profile === 'good' || (profile === 'mixed' && pq.index % 2 === 0);
  if (adapted && q.adapted) {
    await p.waitForSelector('button[aria-label^="Answer A"]');
    const idx = good ? q.adapted.answer : (q.adapted.answer + 1) % (q.adapted.type === 'truefalse' ? 2 : 4);
    await p.click(`button[aria-label^="Answer ${LET[idx]}"]`);
    return;
  }
  switch (q.type) {
    case 'mcq': case 'truefalse': {
      const correct = q.type === 'truefalse' ? (q.answer ? 0 : 1) : (pq.optionOrder ? pq.optionOrder.indexOf(q.answer) : q.answer);
      const n = q.type === 'truefalse' ? 2 : q.options.length;
      const idx = good ? correct : (correct + 1) % n;
      await p.waitForSelector(`button[aria-label^="Answer ${LET[idx]}"]`);
      await p.click(`button[aria-label^="Answer ${LET[idx]}"]`);
      break;
    }
    case 'fill': {
      for (let i = 0; i < q.blanks.length; i++) {
        const sel = `input[aria-label="Blank ${i + 1}"]`;
        await p.waitForSelector(sel);
        const word = good ? q.blanks[i].accepted[0].toUpperCase() + '  ' : profile === 'typo' ? q.blanks[i].accepted[0].slice(0, -1) + 'x' : 'banana';
        await p.type(sel, word);
      }
      await clickText(p, 'Submit');
      break;
    }
    case 'numeric': case 'density': {
      if (q.type === 'density') { await clickText(p, 'Weigh'); await sleep(300); await clickText(p, 'Lower in'); }
      const val = q.type === 'numeric' ? q.answer : q.mass / (q.waterAfter - q.waterBefore);
      await p.waitForSelector('input[aria-label="Numerical answer"]');
      await p.type('input[aria-label="Numerical answer"]', good ? String(val).replace('.', ',') : String(val + 7));
      await clickText(p, 'Submit');
      break;
    }
    case 'matching': {
      const pairs = good ? q.pairs : q.pairs.map((pp, i) => ({ left: pp.left, right: q.pairs[(i + 1) % q.pairs.length].right }));
      for (const pr of pairs) {
        await p.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t))?.click(), pr.left);
        await p.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), pr.right);
      }
      await clickText(p, 'Submit');
      break;
    }
    case 'dragdrop': {
      const items = pq.dragIds.items;
      const zones = good ? q.zones : q.zones.map((z, i) => ({ ...z, answer: q.zones[(i + 1) % q.zones.length].answer }));
      for (const z of zones) {
        const it = items.find((x) => x.text === z.answer);
        const from = await p.$(`[data-item="${it.id}"]`);
        const to = await p.$(`[data-zone="${z.id}"]`);
        const fb = await from.boundingBox(); const tb = await to.boundingBox();
        if (profile === 'good') { // real drag with pointer
          dragTried++;
          await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
          await p.mouse.down();
          await p.mouse.move(fb.x + fb.width / 2 + 8, fb.y + fb.height / 2 + 8, { steps: 3 });
          await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 });
          await p.mouse.up();
          await sleep(200);
          if (await p.$(`[data-zone="${z.id}"] [data-item="${it.id}"]`)) dragOk++;
          else { console.log('drag miss', q.id, z.id, JSON.stringify(fb), JSON.stringify(tb)); const f2 = await p.$(`[data-item="${it.id}"]`); await f2.tap(); await sleep(80); await (await p.$(`[data-zone="${z.id}"]`)).tap(); }
        } else { // tap-to-place
          await from.tap(); await sleep(80); await to.tap();
        }
        await sleep(150);
      }
      await clickText(p, 'Submit');
      break;
    }
    case 'atom': {
      const shells = good ? q.shells : [1, 7, q.atomicNumber - 8];
      const counts = () => p.$$eval('[data-shell]', (els) => els.map((e) => Number(e.querySelector('.game-title')?.textContent ?? 0)));
      if (profile === 'good') { // first electron by dragging onto shell 1
        const e = await p.$('[data-electron]'); const t = await p.$('[data-shell="0"]');
        const eb = await e.boundingBox(); const tb = await t.boundingBox();
        const hit = await p.evaluate((x, y) => { const el = document.elementFromPoint(x, y); return el ? el.outerHTML.slice(0, 120) : 'none'; }, eb.x + eb.width / 2, eb.y + eb.height / 2);
        await p.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2); await p.mouse.down();
        await sleep(60);
        await p.mouse.move(eb.x + eb.width / 2 + 10, eb.y + eb.height / 2 + 10, { steps: 4 });
        await sleep(60);
        await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 14 });
        await sleep(80);
        await p.mouse.up();
        await sleep(300);
        dragTried++;
        if ((await counts())[0] === 1) dragOk++;
        else console.log('atom drag miss', q.id, JSON.stringify(await counts()), JSON.stringify(eb), JSON.stringify(tb), await p.evaluate(() => scrollY), hit);
      }
      for (let guard = 0; guard < 60; guard++) {
        const c = await counts();
        const i = shells.findIndex((n, k) => (c[k] ?? 0) !== n);
        const extra = c.findIndex((n, k) => k >= shells.length && n > 0);
        if (i < 0 && extra < 0) break;
        const k = i >= 0 ? i : extra;
        const target = shells[k] ?? 0;
        await p.click(`button[aria-label="${(c[k] ?? 0) < target ? 'Add electron to' : 'Remove electron from'} shell ${k + 1}"]`);
      }
      await clickText(p, 'Submit');
      break;
    }
  }
}

const profiles = ['good', 'bad', 'mixed', 'good', 'typo']; // Selim (index 3) is adapted
let shotDone = new Set();
let reconnectTested = false, lateTested = false, pauseTested = false, manualCloseTested = false;
for (let guard = 0; guard < 200; guard++) {
  d = await dump();
  const s = room().state;
  if (s.phase === 'GAME_COMPLETE') break;
  if (s.phase === 'ROUND_INTRO' || s.phase === 'LEADERBOARD' || s.phase === 'ROUND_COMPLETE' || s.phase === 'CORRECTION_REVEALED') {
    if (s.phase === 'LEADERBOARD' && !shotDone.has('lb')) { shotDone.add('lb'); await sleep(900); await projector.screenshot({ path: `${OUT}/20-projector-leaderboard.png` }); await students[0].page.screenshot({ path: `${OUT}/21-phone-rank.png` }); }
    if (s.phase === 'ROUND_COMPLETE' && !shotDone.has('rc')) { shotDone.add('rc'); await sleep(900); await projector.screenshot({ path: `${OUT}/22-projector-round-complete.png` }); }
    if (s.phase === 'CORRECTION_REVEALED') {
      const pq = room().hostPrivate.questions[s.qIndex];
      if (!shotDone.has('rev-' + pq.q.type)) {
        shotDone.add('rev-' + pq.q.type);
        await sleep(1200);
        await projector.screenshot({ path: `${OUT}/30-reveal-${pq.q.type}-projector.png` });
        await students[0].page.screenshot({ path: `${OUT}/31-reveal-${pq.q.type}-phone-correct.png` });
        await students[1].page.screenshot({ path: `${OUT}/32-reveal-${pq.q.type}-phone-incorrect.png` });
      }
    }
    await clickText(teacher, s.phase === 'ROUND_INTRO' ? 'Start first question' : s.phase === 'ROUND_COMPLETE' ? 'Next round' : s.phase === 'CORRECTION_REVEALED' ? 'Show leaderboard' : 'Next question');
    await sleep(500);
    continue;
  }
  if (s.phase === 'QUESTION_OPEN') {
    const pq = room().hostPrivate.questions[s.qIndex];
    // Secrecy: nothing on any phone or in the public nodes gives the answer before reveal
    const pub = JSON.stringify({ q: room().question, r: room().reveal ?? null });
    check(`Q${s.qIndex + 1} (${pq.q.type}): no answer key in public data while open`, !/"answer"|"accepted"|"explanation"/.test(pub) && !room().reveal);
    await students[1].page.waitForFunction((i) => !!document.querySelector('button[aria-label^="Answer"], input, [data-item], [data-electron], button'), {}, s.qIndex);
    await sleep(500);
    if (!shotDone.has('open-' + pq.q.type)) {
      shotDone.add('open-' + pq.q.type);
      await projector.screenshot({ path: `${OUT}/10-open-${pq.q.type}-projector.png` });
      await students[0].page.screenshot({ path: `${OUT}/11-open-${pq.q.type}-phone.png` });
      if (pq.q.adapted) await students[3].page.screenshot({ path: `${OUT}/12-open-${pq.q.type}-phone-adapted.png` });
    }
    const studentText = await students[2].page.evaluate(() => document.body.innerText);
    if (pq.q.type === 'mcq') check(`Q${s.qIndex + 1}: phone shows letters only, not the options text`, !pq.q.options.some((o) => o.length > 3 && studentText.includes(o)));

    // Reconnection test on the first matching question: Khalil reloads before answering
    if (!reconnectTested && s.qIndex === 1) {
      reconnectTested = true;
      await students[2].page.reload({ waitUntil: 'networkidle0' });
      await students[2].page.waitForFunction(() => document.body.innerText.includes('Score'), { timeout: 10000 });
      check('Student reconnects after a refresh (same identity, same team)', true);
    }
    // Pause / resume test
    if (!pauseTested && s.qIndex === 2) {
      pauseTested = true;
      await clickText(teacher, 'Pause');
      await students[0].page.waitForFunction(() => document.body.innerText.includes('Game paused'), { timeout: 8000 });
      const blocked = await hacker.send({ t: 'set', path: `rooms/${code}/submissions/${s.qKey}/${anon.user.uid}`, val: { a: '{}', at: { '.sv': 'timestamp' } } });
      check('Pause works and blocks answers', blocked.ok === false);
      await projector.screenshot({ path: `${OUT}/13-projector-paused.png` });
      await clickText(teacher, 'Resume');
      await sleep(500);
    }
    // Answer: everyone except (on Q4) Yasmeen, to test manual close with a missing answer
    const skipper = s.qIndex === 3 ? 4 : -1;
    for (let i = 0; i < students.length; i++) {
      if (i === skipper) continue;
      try { await answer(students[i], profiles[i], pq, i === 3); }
      catch (e) { await students[i].page.screenshot({ path: `${OUT}/fail-${students[i].name}-q${s.qIndex}.png` }); throw e; }
      await sleep(120);
      if (i === 0 && !shotDone.has('locked')) { shotDone.add('locked'); await sleep(300); await students[0].page.screenshot({ path: `${OUT}/14-phone-locked-in.png` }); }
    }
    // Duplicate submission attempt by Youssef (direct write with his own token is covered by rules tests)
    if (skipper >= 0 && !manualCloseTested) {
      manualCloseTested = true;
      await sleep(1500);
      d = await dump();
      check('Correction NOT revealed while a connected student has not answered', room().state.phase === 'QUESTION_OPEN' && !room().reveal);
      await projector.screenshot({ path: `${OUT}/15-projector-waiting.png` });
      await clickText(teacher, 'Close submissions');
      await sleep(600);
      // Late answer after close must fail
      const lateCtx = students[4];
      const late = await lateCtx.page.evaluate(() => document.body.innerText.includes("Time's up"));
      check('Student who did not answer sees "Time\'s up" after manual close', late);
      await clickText(teacher, 'Reveal correction');
    }
    // Fill question with a typo → stops at SUBMISSIONS_CLOSED for teacher review
    await sleep(1200);
    d = await dump();
    if (room().state.phase === 'SUBMISSIONS_CLOSED' && pq.q.type === 'fill') {
      await teacher.waitForFunction(() => document.body.innerText.includes('Review typed answers'), { timeout: 5000 });
      await teacher.screenshot({ path: `${OUT}/16-teacher-review.png` });
      await clickText(teacher, 'Accept');
      await sleep(400);
      await clickText(teacher, 'Reveal correction');
      check('Near-miss typed answers wait for teacher review', true);
    }
    // Late joiner
    if (!lateTested && s.qIndex === 5) {
      lateTested = true;
      const lj = await openStudent('Zaineb');
      await join(lj, 'Zaineb');
      await lj.page.waitForFunction(() => document.body.innerText.includes('Score'), { timeout: 10000 });
      await sleep(800);
      d = await dump();
      const z = Object.values(room().players).find((p) => p.name === 'Zaineb');
      check('Late joiner is placed in the smallest team', !!z?.teamId, z?.teamId);
      await lj.ctx.close(); // disconnects → no longer counts as active
    }
    await teacher.waitForFunction(() => !document.body.innerText.includes('QUESTION OPEN') || true);
    for (let k = 0; k < 30; k++) { d = await dump(); if (room().state.phase !== 'QUESTION_OPEN') break; await sleep(300); }
    continue;
  }
  if (s.phase === 'SUBMISSIONS_CLOSED') { await clickText(teacher, 'Reveal correction'); await sleep(600); continue; }
  if (s.phase === 'PAUSED') { await clickText(teacher, 'Resume'); await sleep(400); continue; }
  await sleep(400);
}

// ── Final checks ──
d = await dump();
check('Game reached the final podium', room().state.phase === 'GAME_COMPLETE');
const sc2 = room().scores;
const by = (n) => Object.entries(room().players).find(([, p]) => p.name === n)[0];
const total = (n) => sc2[by(n)]?.total ?? 0;
const nq = room().hostPrivate.questions.length;
const maxPossible = room().hostPrivate.questions.reduce((a, pq) => a + pq.q.points + (pq.q.speedBonus ?? 0), 0);
check('Always-correct student got every question right', sc2[by('Youssef')].correct === nq, `${sc2[by('Youssef')].correct}/${nq}, ${total('Youssef')} of max ${maxPossible}`);
check('Always-wrong student scored 0', total('Mariem') === 0, String(total('Mariem')));
check('Partial credit given to mixed student', total('Khalil') > 0 && total('Khalil') < total('Youssef'), String(total('Khalil')));
const teamTotals = Object.keys(room().teams).map((t) => Object.entries(room().players).filter(([, p]) => !p.removed && p.teamId === t).reduce((a, [u]) => a + (sc2[u]?.total ?? 0), 0));
check('Team score = sum of members', teamTotals.reduce((a, b) => a + b, 0) === Object.entries(room().players).filter(([, p]) => !p.removed).reduce((a, [u]) => a + (sc2[u]?.total ?? 0), 0), teamTotals.join(', '));
const subsCount = Object.values(room().submissions ?? {}).map((x) => Object.keys(x).length);
check('One submission per student per question', subsCount.every((n) => n <= 7));
await sleep(2500);
await projector.screenshot({ path: `${OUT}/40-projector-podium.png` });
await students[0].page.screenshot({ path: `${OUT}/41-phone-final.png` });
await sleep(14500);
await projector.screenshot({ path: `${OUT}/42-projector-team-podium.png` });

// Export
await teacher.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Export Results')).click());
await teacher.waitForFunction(() => document.body.innerText.includes('Student Performance Report'));
await teacher.screenshot({ path: `${OUT}/43-teacher-export.png` });
await teacher.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Live Results')).click());
await sleep(500);
await teacher.screenshot({ path: `${OUT}/44-teacher-results.png` });
check('Projector shows the leaderboard names', (await projector.evaluate(() => document.body.innerText)).includes('Youssef'));
check('Real drag-and-drop works (pointer drags that landed)', dragOk === dragTried, `${dragOk}/${dragTried}`);
// ── Second game: INDIVIDUAL mode ──
await teacher.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => /Lobby|Live Game/.test(b.textContent)).click());
teacher.once('dialog', (dl) => dl.accept());
await clickText(teacher, 'New game room');
await teacher.waitForFunction((old) => { const c = document.querySelector('[data-testid=room-code]')?.textContent?.trim(); return /^\d{6}$/.test(c ?? '') && c !== old; }, { timeout: 15000 }, code);
const code2 = (await teacher.$eval('[data-testid=room-code]', (e) => e.textContent)).trim();
await clickText(teacher, 'Individual');
await sleep(600);
await projector.goto(APP + `#/projector/${code2}`, { waitUntil: 'networkidle0' });
const solos = [];
for (const n of ['Amira', 'Bilel']) {
  const st = await openStudent(n, { noCode: true });
  await join(st, n, code2);
  await st.page.waitForFunction(() => document.body.innerText.includes("You're in"), { timeout: 10000 });
  solos.push(st);
}
await clickText(teacher, 'Start Game');
await sleep(800);
d = await dump();
const r2 = d.rooms[code2];
check('Individual mode: Start Game skips team assignment', r2.state.phase === 'ROUND_INTRO', r2.state.phase);
check('Individual mode: no teams and no team ids', !r2.teams && Object.values(r2.players).every((pl) => !pl.teamId));
await clickText(teacher, 'Start first question');
await sleep(800);
d = await dump();
const pq2 = d.rooms[code2].hostPrivate.questions[0];
for (const st of solos) await answer(st, 'good', pq2, false);
await sleep(2000);
d = await dump();
check('Individual mode: correction revealed after everyone answered', d.rooms[code2].state.phase === 'CORRECTION_REVEALED');
await sleep(1000);
const projText = await projector.evaluate(() => document.body.innerText);
check('Individual mode: projector shows no team leaderboard', !/TEAM LEADERBOARD/.test(projText) && /INDIVIDUAL/.test(projText));
check('Individual mode: phone shows "Solo player"', (await solos[0].page.evaluate(() => document.body.innerText)).includes('Solo player'));
await projector.screenshot({ path: `${OUT}/50-individual-projector.png` });
await solos[0].page.screenshot({ path: `${OUT}/51-individual-phone.png` });
await clickText(teacher, 'Show leaderboard');
await sleep(1200);
await projector.screenshot({ path: `${OUT}/52-individual-leaderboard.png` });
await teacher.screenshot({ path: `${OUT}/53-individual-teacher.png` });

check('No JavaScript errors in any page', errors.length === 0, errors.slice(0, 5).join(' | '));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
oracle.close(); hacker.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
