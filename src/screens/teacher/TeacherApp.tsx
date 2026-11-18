import { confirmAction } from '../../lib/env';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  BarChart3, Check, ClipboardCopy, Eye, FolderOpen, HelpCircle, Home, ListChecks, LogOut, Maximize, MonitorPlay, Pause, Play,
  RefreshCw, Settings2, Settings as Cog, Share2, Shuffle, SkipForward, Square, Trophy, UserMinus, UserPlus, Users, XCircle, Lock, Sparkles, Leaf, Atom, FlaskConical,
} from 'lucide-react';
import { getBackend, IS_DEMO } from '../../backend';
import { saveBank } from '../../game/banks';
import { addDemoStudents } from '../../game/demoBots';
import { hasRealAddress } from '../../lib/env';
import { parseJsonBank } from '../../lib/importSchema';
import { joinUrl, useHostRoom, useListen, useUser } from '../../hooks';
import { Logo, Persona, CreatedBy } from '../../components/Brand';
import { GameButton, Modal, Spinner, StatChip, TeamBadge, useRemaining, useToast, LAB_STYLE, Avatar } from '../../components/ui';
import { listenBanks } from '../../game/banks';
import {
  activePlayers, advance, closeSubmissions, createRoom, endGame, gradeAll, lockLobby, pause, placeUnassigned, removePlayer, renameTeam,
  reshuffleTeams, restorePlayer, resume, reveal, setAdapted, setOverride, updateLobbySetup, type HostRoom, parseSubmission,
} from '../../game/host';
import { canTransition, displayedOptions, correctDisplayIndex, isIndividual, LETTERS, TEAM_SYMBOLS } from '../../lib/game';
import { DEFAULT_SETTINGS, QTYPE_LABEL, type GameSettings, type QuestionBank, type RoundPlan, type Submission } from '../../lib/types';
import { QuestionBankManager } from './QuestionBank';
import { SettingsPanel } from './Settings';
import { LiveResults, ExportPanel } from './Results';
import { PreviewModal } from './Preview';
import { defaultSelection, Section, type TeacherCtx } from './common';

const db = () => getBackend('host');

export default function TeacherApp() {
  const user = useUser('host');
  if (user === undefined) return <div className="relative z-10 flex h-full items-center justify-center"><Spinner className="h-12 w-12" /></div>;
  if (!user || !user.isTeacher) return <Login />;
  return <AllowlistGate uid={user.uid} email={user.email} />;
}

/** Only accounts listed under teacherAllowlist in the database can use the Teacher Panel. */
function AllowlistGate({ uid, email }: { uid: string; email?: string }) {
  const allowed = useListen<boolean | 'loading'>('host', `teacherAllowlist/${uid}`, 'loading', false);
  const [copied, setCopied] = useState(false);
  if (allowed === 'loading') return <div className="relative z-10 flex h-full items-center justify-center"><Spinner className="h-12 w-12" /></div>;
  if (allowed === true) return <Dashboard uid={uid} email={email} />;
  return (
    <div className="relative z-10 mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo width={300} />
      <div className="neon-panel flex w-full flex-col gap-4 p-6 text-left">
        <h1 className="game-title text-center text-2xl">One last setup step</h1>
        <p className="font-bold text-white/85">You are signed in as <b>{email}</b>, but this account is not on the teacher list yet. This protects your game: only accounts you add can use the Teacher Panel.</p>
        <div className="rounded-xl bg-black/30 p-3">
          <p className="text-sm font-extrabold text-white/70">Your account ID (UID)</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-lg font-bold text-[#0d1a5c]" data-testid="my-uid">{uid}</code>
            <GameButton variant="yellow" className="text-base" onClick={() => navigator.clipboard?.writeText(uid).then(() => setCopied(true)).catch(() => undefined)}>{copied ? 'Copied ✓' : 'Copy'}</GameButton>
          </div>
        </div>
        <ol className="list-decimal space-y-1 pl-6 font-bold text-white/85">
          <li>In the Firebase console open <b>Realtime Database → Data</b>.</li>
          <li>Hover over the top line (the database address) and click <b>+</b>.</li>
          <li>Key: <code className="rounded bg-white/15 px-1">teacherAllowlist</code>, then click <b>+</b> again on that new line to add a child.</li>
          <li>Child key: paste your UID · Value: <code className="rounded bg-white/15 px-1">true</code> · click <b>Add</b>.</li>
        </ol>
        <p className="text-sm text-white/70">This page updates by itself as soon as you have added it.</p>
        <button className="self-center text-sm font-bold text-white/70 underline" onClick={() => db().signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState(IS_DEMO ? 'teacher@demo.sq' : '');
  const [pw, setPw] = useState(IS_DEMO ? 'demo' : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (busy || !email || !pw) return;
    setBusy(true); setErr(null);
    try { await db().signInTeacher(email.trim(), pw); } catch { setErr('Wrong email or password.'); } finally { setBusy(false); }
  };
  return (
    <div className="relative z-10 flex min-h-full items-center justify-center gap-10 p-6">
      <Persona className="hidden h-[80vh] w-auto lg:block" />
      <form onSubmit={submit} onKeyDown={(e) => e.key === 'Enter' && submit(e)} className="neon-panel flex w-full max-w-md flex-col gap-4 p-6">
        <Logo width={320} className="mx-auto" />
        <h1 className="game-title text-center text-3xl">Teacher Panel</h1>
        <label className="flex flex-col gap-1 font-extrabold">Email<input className="sq-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="flex flex-col gap-1 font-extrabold">Password<input className="sq-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {IS_DEMO && <p className="rounded-xl bg-[#ffd23f]/20 px-3 py-2 text-center text-sm font-bold">Demo mode: the login is already filled in — just press Sign in.</p>}
        {err && <p role="alert" className="rounded-xl bg-[#e8164f]/90 px-3 py-2 text-center font-extrabold">{err}</p>}
        <GameButton variant="yellow" type="button" onClick={submit} className="py-3 text-2xl" disabled={busy || !email || !pw}>{busy ? <Spinner /> : <Lock className="h-6 w-6" />} Sign in</GameButton>
        <button type="button" onClick={() => nav('/')} className="text-sm font-bold text-white/70">← Back to the main menu</button>
        <CreatedBy className="text-center" />
      </form>
    </div>
  );
}

type Tab = 'lobby' | 'bank' | 'settings' | 'results' | 'export';

function Dashboard({ uid, email }: { uid: string; email?: string }) {
  const toast = useToast();
  const nav = useNavigate();
  const [banks, setBanks] = useState<Record<string, QuestionBank> | null>(null);
  useEffect(() => listenBanks(db(), uid, setBanks), [uid]);
  // Demo mode: load the 50-question bank automatically the first time.
  const seeded = useRef(false);
  useEffect(() => {
    if (!IS_DEMO || !banks || Object.keys(banks).length || seeded.current) return;
    seeded.current = true;
    if (import.meta.env.VITE_BACKEND === 'demo') {
      // Optional file: only present on the teacher's own computer, never in the public repository.
      const found = import.meta.glob('../../../question-banks/science-quest-50.json');
      const load = Object.values(found)[0] as undefined | (() => Promise<any>);
      load?.().then((m) => saveBank(db(), uid, parseJsonBank(JSON.stringify(m.default ?? m)).bank));
    }
  }, [banks, uid]);
  const activeRoom = useListen<string | null | 'loading'>('host', `teachers/${uid}/activeRoom`, 'loading', null);
  const code = activeRoom === 'loading' ? null : activeRoom;
  const { room } = useHostRoom(code);
  const [tab, setTab] = useState<Tab>('lobby');
  const [bankTabId, setBankTabId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);

  const roomBank = room?.meta?.bankId && banks?.[room.meta.bankId] ? banks[room.meta.bankId] : banks ? Object.values(banks)[0] ?? null : null;
  useEffect(() => { if (!bankTabId && banks && Object.keys(banks).length) setBankTabId(roomBank?.id ?? Object.keys(banks)[0]); }, [banks, bankTabId, roomBank]);

  // Create a room automatically once a bank exists and there is no active room.
  const newRoom = useCallback(async (settings?: GameSettings) => {
    if (!banks || !Object.keys(banks).length || creating.current) return;
    creating.current = true;
    try {
      const b = roomBank ?? Object.values(banks)[0];
      await createRoom(db(), uid, settings ?? room?.settings ?? DEFAULT_SETTINGS, defaultSelection(b), b);
    } catch (e) { toast.err((e as Error).message); } finally { creating.current = false; }
  }, [banks, roomBank, uid, room?.settings]);
  useEffect(() => {
    if (activeRoom === 'loading' || !banks || !Object.keys(banks).length) return;
    if (!code || room === null) newRoom();
  }, [activeRoom, banks, code, room, newRoom]);

  const ctx: TeacherCtx = { db: db(), uid, banks: banks ?? {}, bank: roomBank, code, room, toast };
  // In demo mode the referee runs app-wide (DemoReferee), so it keeps going while you look at other views.
  useGameAutomation(IS_DEMO ? null : code, room);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };

  const phase = room?.state.phase;
  const inLobby = phase === 'LOBBY';
  const players = Object.entries(room?.players ?? {});
  const activeCount = players.filter(([, p]) => !p.removed).length;
  const qCount = room?.state.totalQuestions ?? 0;

  const saveSetup = async (s: GameSettings, sel: RoundPlan[]) => {
    if (!code || !room || !roomBank) return;
    if (inLobby) await updateLobbySetup(db(), code, s, sel, roomBank);
    else await db().update(`rooms/${code}/settings`, { leaderboardFrequency: s.leaderboardFrequency, autoRevealWhenAllSubmitted: s.autoRevealWhenAllSubmitted, autoCloseOnTimeout: s.autoCloseOnTimeout, allowLateJoin: s.allowLateJoin });
    toast.ok('Settings saved');
  };
  const changeBank = async (id: string) => {
    if (!code || !room || !banks?.[id]) return;
    await updateLobbySetup(db(), code, room.settings, defaultSelection(banks[id]), banks[id]);
    toast.ok(`Using “${banks[id].name}”`);
  };

  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast.ok(msg); } catch { toast.err('Copy failed — select the text manually'); } };
  const share = async () => {
    const url = joinUrl(code ?? '');
    if (navigator.share) navigator.share({ title: 'Science Quest', text: `Join Science Quest with code ${code}`, url }).catch(() => undefined);
    else copy(url, 'Join link copied');
  };
  const openProjector = () => {
    // In sandboxed previews there is no second window: show the projector in this window instead.
    const w = hasRealAddress() ? window.open(`${location.pathname}#/projector/${code}`, 'sq-projector', 'popup=no') : null;
    if (!w) nav(`/projector/${code}`);
  };

  const NAV: { id: Tab; label: string; Icon: typeof Home }[] = [
    { id: 'lobby', label: inLobby || !room ? 'Lobby' : 'Live Game', Icon: inLobby || !room ? Home : MonitorPlay },
    { id: 'bank', label: 'Question Bank', Icon: ListChecks },
    { id: 'settings', label: 'Game Settings', Icon: Settings2 },
    { id: 'results', label: 'Live Results', Icon: BarChart3 },
    { id: 'export', label: 'Export Results', Icon: FolderOpen },
  ];

  return (
    <div className="relative z-10 min-h-full">
      {toast.node}
      <div className="mx-auto flex max-w-[1680px] gap-5 px-4 py-3">
        <aside className="hidden w-[300px] shrink-0 flex-col xl:flex">
          <div className="sticky top-3 flex h-[calc(100vh-24px)] flex-col">
            <Persona className="mx-auto h-[55vh] w-auto" />
            <div className="mt-auto rounded-2xl bg-gradient-to-b from-[#0f1f6b] to-[#081247] px-5 py-3 text-center shadow-[0_0_0_3px_#ffd23f,0_0_18px_rgba(255,210,63,0.5)]">
              <p className="game-title text-2xl leading-tight">Mrs Sarra<br />Ben Amara ♡</p>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex flex-wrap items-center gap-4">
            <Logo width={300} />
            <div className="chip flex items-center gap-3 !rounded-full px-6 py-3"><Cog className="h-9 w-9 animate-spin-slow" /><span className="game-title text-3xl">TEACHER PANEL</span></div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-sm text-white/60 md:inline">{email}</span>
              <button className="chip !rounded-full p-3" onClick={() => setHelp(true)} aria-label="Help"><HelpCircle className="h-6 w-6" /></button>
              <button className="chip !rounded-full p-3" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} aria-label="Full screen"><Maximize className="h-6 w-6" /></button>
              <button className="chip !rounded-full p-3" onClick={() => db().signOut().then(() => nav('/'))} aria-label="Sign out"><LogOut className="h-6 w-6" /></button>
            </div>
          </header>

          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
            <div className="neon-panel flex items-center gap-4 px-4 py-3">
              <Users className="h-9 w-9 shrink-0" />
              <div className="flex-1">
                <p className="game-title text-lg">Game Room</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-[#081247] px-4 py-1 font-display text-4xl tracking-[0.12em] ring-2 ring-[#38e1ff]" data-testid="room-code">{code ?? '······'}</span>
                  <button className="rounded-full bg-white/15 p-2 hover:bg-white/25" onClick={() => code && copy(code, 'Room code copied')} aria-label="Copy room code"><ClipboardCopy className="h-5 w-5" /></button>
                  <button className="rounded-full bg-white/15 p-2 hover:bg-white/25" onClick={share} aria-label="Share join link"><Share2 className="h-5 w-5" /></button>
                </div>
                <p className="mt-1 text-xs font-bold text-white/70">{phase ? `Status: ${phase.replace(/_/g, ' ').toLowerCase()}` : 'Share this code with your students'}</p>
              </div>
              {code && <div className="hidden rounded-lg bg-white p-1 2xl:block"><QRCodeSVG value={joinUrl(code)} size={72} /></div>}
            </div>
            <StatChip icon={<Users className="h-8 w-8" />} value={`${activeCount} / ${room?.settings.maxPlayers ?? 30}`} label="Players" className="justify-center" />
            <StatChip icon={<Trophy className="h-8 w-8 text-[#ffd23f]" />} value={isIndividual(room?.settings) ? 'Solo' : room?.settings.teamCount ?? 4} label={isIndividual(room?.settings) ? 'Individual' : 'Teams'} className="justify-center" />
            <StatChip icon={<ListChecks className="h-8 w-8" />} value={qCount} label="Questions" className="justify-center" />
            <GameButton variant="navy" className="text-xl" onClick={() => setTab('settings')}><Settings2 className="h-6 w-6" /> Game Settings</GameButton>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <nav className="neon-panel flex shrink-0 flex-row gap-1 overflow-x-auto p-2 lg:w-[220px] lg:flex-col" aria-label="Teacher sections">
              {NAV.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setTab(id)} className={`game-title flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-lg transition ${tab === id ? 'bg-gradient-to-r from-[#2f7bff] to-[#1446c9] shadow-[0_0_14px_#38e1ff]' : 'hover:bg-white/10'}`}>
                  <Icon className="h-6 w-6" /> {label}
                </button>
              ))}
              <div className="mt-auto hidden flex-col gap-2 pt-4 lg:flex">
                <GameButton variant="purple" className="text-base" onClick={openProjector} disabled={!code}><MonitorPlay className="h-5 w-5" /> Open projector</GameButton>
                <GameButton variant="ghost" className="text-sm" disabled={busy} onClick={() => { if (confirmAction(phase && phase !== 'GAME_COMPLETE' && phase !== 'LOBBY' ? 'A game is running. Start a brand new room anyway?' : 'Start a new game room?')) run(() => newRoom()); }}><RefreshCw className="h-4 w-4" /> New game room</GameButton>
              </div>
            </nav>

            <main className="min-w-0 flex-1">
              {banks === null || activeRoom === 'loading' ? <div className="flex justify-center p-10"><Spinner className="h-12 w-12" /></div> : (
                <>
                  {tab === 'lobby' && (!Object.keys(banks).length ? (
                    <Section title="Welcome to Science Quest!" icon={<Sparkles className="h-7 w-7 text-[#ffd23f]" />}>
                      <p className="mb-4 text-white/85">Start by importing your question bank (the <b>science-quest-50.json</b> file). A game room is created automatically afterwards.</p>
                      <GameButton variant="yellow" onClick={() => setTab('bank')}><ListChecks className="h-5 w-5" /> Go to the Question Bank</GameButton>
                    </Section>
                  ) : !room ? <div className="flex justify-center p-10"><Spinner className="h-12 w-12" /></div> : inLobby || phase === 'TEAM_ASSIGNMENT' ? (
                    <LobbyView ctx={ctx} room={room} busy={busy} run={run} onPreview={() => setPreview(true)} onProjector={openProjector} />
                  ) : (
                    <LiveControl ctx={ctx} room={room} busy={busy} run={run} onProjector={openProjector} onNewRoom={() => run(() => newRoom())} onResults={() => setTab('export')} />
                  ))}
                  {tab === 'bank' && <QuestionBankManager ctx={ctx} selectedBankId={bankTabId} setSelectedBankId={setBankTabId} onUseInGame={async (b, rounds) => {
                    if (!code || !room) return;
                    if (!inLobby) return toast.err('The game has started — start a new game room to change questions.');
                    await updateLobbySetup(db(), code, room.settings, rounds, b);
                    toast.ok(`${rounds.reduce((n, r) => n + r.questionIds.length, 0)} questions set for this game`);
                    setTab('settings');
                  }} />}
                  {tab === 'settings' && room && <SettingsPanel bank={roomBank} banks={banks} settings={{ ...DEFAULT_SETTINGS, ...room.settings }} selection={room.hostPrivate?.selection ?? []} locked={!inLobby} onSave={saveSetup} onChangeBank={changeBank} />}
                  {tab === 'results' && <LiveResults room={room} />}
                  {tab === 'export' && <ExportPanel room={room} code={code} />}
                </>
              )}
            </main>

            {tab === 'lobby' && room && (inLobby || phase === 'TEAM_ASSIGNMENT') && <TeamPanel ctx={ctx} room={room} busy={busy} run={run} />}
          </div>
        </div>
      </div>
      {preview && room && roomBank && <PreviewFirst room={room} bank={roomBank} onClose={() => setPreview(false)} />}
      <Modal open={help} onClose={() => setHelp(false)} title="How to run a game">
        <ol className="list-decimal space-y-2 pl-6 text-white/90">
          <li><b>Question Bank</b>: import your bank (JSON/CSV) or add questions. Tick questions and “Use selected in the game”, or load a ready-made game in <b>Game Settings</b>.</li>
          <li>Click <b>Open projector</b> and drag that window to the classroom screen (press the ⛶ button for full screen).</li>
          <li>Students open the game on their phones, tap <b>PLAY</b>, and enter the room code and their name.</li>
          <li><b>Start Game</b> locks the lobby and makes random, balanced teams. Then <b>Begin Round 1</b>.</li>
          <li>For each question: students answer on their phones. When everyone has answered, the correction is revealed automatically (or use <b>Close submissions</b> / <b>Reveal correction</b> yourself). Use <b>Next</b> to move on — only you can advance.</li>
          <li>At the end, the podium appears. Download the performance report from <b>Export Results</b>.</li>
        </ol>
        <p className="mt-4 text-sm text-white/70">Keep this Teacher Panel open during the game: it is the referee that grades answers.</p>
      </Modal>
    </div>
  );
}

function PreviewFirst({ room, bank, onClose }: { room: HostRoom; bank: QuestionBank; onClose: () => void }) {
  const ids = (room.hostPrivate?.selection ?? []).flatMap((r) => r.questionIds);
  const [i, setI] = useState(0);
  const q = bank.questions[ids[i]];
  return (
    <>
      <PreviewModal question={q ?? null} onClose={onClose} />
      {q && (
        <div className="fixed bottom-4 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#0b1a5c] px-4 py-2 ring-2 ring-[#38e1ff]">
          <button disabled={i === 0} onClick={() => setI(i - 1)} className="font-extrabold disabled:opacity-30">‹ Prev</button>
          <span className="font-extrabold">Question {i + 1} / {ids.length}</span>
          <button disabled={i >= ids.length - 1} onClick={() => setI(i + 1)} className="font-extrabold disabled:opacity-30">Next ›</button>
        </div>
      )}
    </>
  );
}

const ROUND_ICON = { biology: Leaf, physics: Atom, chemistry: FlaskConical, mixed: Trophy } as const;

function GameFlow({ room }: { room: HostRoom }) {
  const rounds = room.plan?.rounds ?? [];
  return (
    <Section title="Game Flow – The Three Labs" icon={<Sparkles className="h-6 w-6" />}>
      <div className="flex flex-wrap items-center gap-1.5">
        {rounds.map((r, i) => {
          const Icon = ROUND_ICON[r.lab];
          const st = LAB_STYLE[r.lab];
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex min-w-[118px] flex-col items-center rounded-2xl bg-gradient-to-b ${st.ring} px-4 py-3 text-center shadow-[0_0_0_2px_#ffffff88]`} style={{ boxShadow: `0 0 16px ${st.color}` }}>
                <Icon className="h-7 w-7" />
                <span className="game-title leading-tight">{r.title.replace(/:.*/, '')}</span>
                <span className="game-title text-sm leading-tight">{r.title.replace(/^[^:]*:\s*/, '')}</span>
                <span className="text-xs font-bold">({r.count} questions)</span>
              </div>
              {i < rounds.length - 1 && <SkipForward className="h-5 w-5 text-[#38e1ff]" />}
            </div>
          );
        })}
        {!rounds.length && <p className="text-white/70">No questions selected yet — open Game Settings or the Question Bank.</p>}
      </div>
    </Section>
  );
}

function LobbyView({ ctx, room, busy, run, onPreview, onProjector }: { ctx: TeacherCtx; room: HostRoom; busy: boolean; run: (f: () => Promise<unknown>) => void; onPreview: () => void; onProjector: () => void }) {
  const code = ctx.code!;
  const players = Object.entries(room.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const active = players.filter(([, p]) => !p.removed);
  const locked = room.state.phase === 'TEAM_ASSIGNMENT';
  const solo = isIndividual(room.settings);
  const hasAdapted = (room.hostPrivate?.selection ?? []).some((r) => r.questionIds.some((id) => ctx.bank?.questions[id]?.adapted));
  return (
    <div className="flex flex-col gap-4">
      <Section title={locked ? 'Teams are ready!' : 'Lobby – Waiting for Students'} icon={<Users className="h-7 w-7" />} right={<span className="text-sm font-bold text-white/70">{active.length} joined</span>}>
        {players.length ? (
          <div className="max-h-[42vh] overflow-auto rounded-xl ring-1 ring-[#38e1ff]/30 scroll-thin">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#0b1a5c] text-sm text-white/80"><tr><th className="p-2">#</th><th className="p-2">Student Name</th><th className="p-2">Status</th>{!solo && <th className="p-2">Team</th>}{hasAdapted && <th className="p-2" title="Show the simpler adapted version to this student">Adapted</th>}<th className="p-2 text-right">Remove</th></tr></thead>
              <tbody>
                {players.map(([uid, p], i) => (
                  <tr key={uid} className={`border-t border-white/10 ${p.removed ? 'opacity-40' : ''}`}>
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 font-extrabold"><span className="flex items-center gap-2"><Avatar name={p.name} size={26} />{p.name}{p.removed && ' (removed)'}</span></td>
                    <td className="p-2"><span className={`inline-flex items-center gap-1 text-sm font-bold ${room.presence?.[uid] ? 'text-[#3dff7a]' : 'text-white/50'}`}><span className={`h-2.5 w-2.5 rounded-full ${room.presence?.[uid] ? 'bg-[#3dff7a] shadow-[0_0_6px_#3dff7a]' : 'bg-white/40'}`} />{room.presence?.[uid] ? 'online' : 'offline'}</span></td>
                    {!solo && <td className="p-2">{p.teamId && room.teams?.[p.teamId] ? <span className="flex items-center gap-2"><TeamBadge teamId={p.teamId} team={room.teams[p.teamId]} size={22} />{room.teams[p.teamId].name}</span> : '–'}</td>}
                    {hasAdapted && <td className="p-2"><input type="checkbox" checked={!!p.adapted} onChange={(e) => run(() => setAdapted(ctx.db, code, uid, e.target.checked))} aria-label={`Adapted questions for ${p.name}`} /></td>}
                    <td className="p-2 text-right">{p.removed
                      ? <button className="rounded-full p-2 hover:bg-white/10" onClick={() => run(() => restorePlayer(ctx.db, code, uid))} aria-label={`Restore ${p.name}`}><UserPlus className="h-5 w-5" /></button>
                      : <button className="rounded-full p-2 hover:bg-white/10" onClick={() => confirmAction(`Remove ${p.name} from the game?`) && run(() => removePlayer(ctx.db, code, uid))} aria-label={`Remove ${p.name}`}><UserMinus className="h-5 w-5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="h-16 w-16 text-[#9fd8ff]" />
            <p className="text-lg font-extrabold">No students have joined yet.</p>
            <p className="text-white/75">Share the Room Code to get started! Students go to <b className="break-all">{joinUrl().replace(/^https?:\/\//, '')}</b></p>
          </div>
        )}
      </Section>
      <GameFlow room={room} />
      <div className="flex flex-wrap items-center justify-center gap-4">
        {!locked ? (
          <GameButton variant="green" className="px-12 py-4 text-4xl" disabled={busy || !active.length || !room.state.totalQuestions} onClick={() => run(() => lockLobby(ctx.db, code, room, ctx.bank?.questions ?? {}))}>
            <Play className="h-10 w-10" fill="white" /> Start Game
          </GameButton>
        ) : (
          <>
            <GameButton variant="green" className="px-10 py-4 text-3xl" disabled={busy} onClick={() => run(() => advance(ctx.db, code, room))}><Play className="h-9 w-9" fill="white" /> Begin Round 1</GameButton>
            <GameButton variant="ghost" disabled={busy} onClick={() => run(() => reshuffleTeams(ctx.db, code, room))}><Shuffle className="h-5 w-5" /> Reshuffle teams</GameButton>
          </>
        )}
        <GameButton variant="navy" className="text-xl" onClick={onPreview} disabled={!room.state.totalQuestions}><Eye className="h-6 w-6" /> Preview Question</GameButton>
        {IS_DEMO && !locked && <GameButton variant="yellow" className="text-xl" onClick={() => { const n = addDemoStudents(code, room); ctx.toast.ok(n ? `${n} demo students joined` : 'Demo students are already here'); }}><UserPlus className="h-6 w-6" /> Add 8 demo students</GameButton>}
        <GameButton variant="purple" className="text-xl lg:hidden" onClick={onProjector}><MonitorPlay className="h-6 w-6" /> Projector</GameButton>
      </div>
      {!active.length && <p className="text-center text-sm font-bold text-white/60">Start Game becomes available when at least one student has joined.</p>}
    </div>
  );
}

function TeamPanel({ ctx, room, busy, run }: { ctx: TeacherCtx; room: HostRoom; busy: boolean; run: (f: () => Promise<unknown>) => void }) {
  const code = ctx.code!;
  const inLobby = room.state.phase === 'LOBBY';
  const teams = Object.entries(room.teams ?? {}).sort((a, b) => a[1].order - b[1].order);
  const [names, setNames] = useState<Record<string, string>>({});
  const setCount = (n: number) => run(() => updateLobbySetup(ctx.db, code, { ...room.settings, teamCount: n }, room.hostPrivate?.selection ?? [], ctx.bank!));
  const saveName = (tid: string, i: number) => {
    const name = (names[tid] ?? '').trim();
    if (!name || name === room.teams?.[tid]?.name) return;
    const teamNames = [...room.settings.teamNames];
    teamNames[i] = name;
    run(async () => {
      if (inLobby) await updateLobbySetup(ctx.db, code, { ...room.settings, teamNames }, room.hostPrivate?.selection ?? [], ctx.bank!);
      else { await renameTeam(ctx.db, code, tid, name); await ctx.db.set(`rooms/${code}/settings/teamNames`, teamNames); }
    });
  };
  return (
    <aside className="neon-panel flex w-full shrink-0 flex-col gap-3 p-4 lg:w-[300px]">
      <h2 className="game-title flex items-center gap-2 text-xl"><Users className="h-6 w-6" /> How students play</h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Play mode">
        {(['teams', 'individual'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={(room.settings.playMode ?? 'teams') === m} disabled={!inLobby || busy}
            onClick={() => run(() => updateLobbySetup(ctx.db, code, { ...room.settings, playMode: m }, room.hostPrivate?.selection ?? [], ctx.bank!))}
            className={`game-title rounded-xl px-2 py-3 text-lg ring-2 ${(room.settings.playMode ?? 'teams') === m ? 'bg-[#2f7bff] ring-white shadow-[0_0_14px_#38e1ff]' : 'bg-[#0b1a5c] ring-[#38e1ff]/50'} disabled:opacity-60`}>
            {m === 'teams' ? '👥 Teams' : '🧑 Individual'}
          </button>
        ))}
      </div>
      {isIndividual(room.settings) ? (
        <p className="rounded-xl bg-black/25 p-3 text-sm font-bold text-white/85">Every student plays on their own. Only the individual leaderboard and podium are shown — no teams.</p>
      ) : (<>
      <h3 className="game-title mt-1 flex items-center gap-2 text-lg"><Shuffle className="h-5 w-5" /> Team Assignment</h3>
      <select className="field" disabled value="random"><option value="random">Random (Automatic)</option></select>
      <p className="flex items-center gap-2 font-extrabold"><Users className="h-5 w-5" /> Number of Teams</p>
      <div className="grid grid-cols-4 gap-2">
        {[2, 3, 4, 5].map((n) => (
          <button key={n} disabled={!inLobby || busy} onClick={() => setCount(n)} className={`game-title h-12 rounded-xl text-2xl ring-2 ${room.settings.teamCount === n ? 'bg-[#2f7bff] ring-white shadow-[0_0_14px_#38e1ff]' : 'bg-[#0b1a5c] ring-[#38e1ff]/50'} disabled:opacity-60`}>{n}</button>
        ))}
      </div>
      <p className="font-extrabold">✎ Team Names <span className="text-white/60">(click to edit)</span></p>
      {teams.map(([tid, t], i) => (
        <div key={tid} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3" style={{ background: `linear-gradient(90deg, ${t.color}, ${t.color}66)`, boxShadow: `0 0 10px ${t.color}` }}>
          <span className="game-title flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-xl text-[#0d1a5c]">{TEAM_SYMBOLS[i]}</span>
          <input className="game-title w-full bg-transparent text-lg outline-none placeholder:text-white/70" value={names[tid] ?? t.name} onChange={(e) => setNames({ ...names, [tid]: e.target.value })} onBlur={() => saveName(tid, i)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Team ${i + 1} name`} maxLength={24} />
          {!inLobby && <span className="text-sm font-extrabold">{Object.values(room.players ?? {}).filter((p) => !p.removed && p.teamId === tid).length}</span>}
        </div>
      ))}
      <p className="text-xs text-white/60">Students are shared out randomly and evenly when you press Start Game. Teams stay fixed for the whole game; late joiners go to the smallest team.</p>
      </>)}
    </aside>
  );
}

/** The teacher's controls during a game. Buttons are enabled only when the state machine allows them. */
function LiveControl({ ctx, room, busy, run, onProjector, onNewRoom, onResults }: { ctx: TeacherCtx; room: HostRoom; busy: boolean; run: (f: () => Promise<unknown>) => void; onProjector: () => void; onNewRoom: () => void; onResults: () => void }) {
  const code = ctx.code!;
  const s = room.state;
  const phase = s.phase;
  const pq = s.qIndex >= 0 ? room.hostPrivate?.questions?.[s.qIndex] : undefined;
  const round = room.plan.rounds[s.roundIndex];
  const subs = ((room as any).submissions?.[s.qKey] ?? {}) as Record<string, Submission>;
  const players = Object.entries(room.players ?? {}).filter(([, p]) => !p.removed);
  const active = activePlayers(room);
  const { remainingMs } = useRemaining({ startedAt: s.startedAt, accMs: s.accMs, timeLimit: s.timeLimit }, ctx.db.serverNow, phase === 'QUESTION_OPEN');
  const preview = useMemo(() => (pq && (phase === 'QUESTION_OPEN' || phase === 'SUBMISSIONS_CLOSED') ? gradeAll(room, subs, (room.hostPrivate?.overrides?.[s.qKey] ?? {}) as any) : null), [room, subs, pq, phase, s.qKey]);
  const effective = phase === 'PAUSED' ? s.prevPhase : phase;
  const can = {
    pause: phase !== 'PAUSED' && phase !== 'GAME_COMPLETE',
    resume: phase === 'PAUSED',
    close: phase === 'QUESTION_OPEN',
    reveal: phase === 'QUESTION_OPEN' || phase === 'SUBMISSIONS_CLOSED',
    next: ['CORRECTION_REVEALED', 'LEADERBOARD', 'ROUND_COMPLETE', 'ROUND_INTRO', 'TEAM_ASSIGNMENT'].includes(phase),
    end: canTransition(phase, 'GAME_COMPLETE'),
  };
  const nextLabel = phase === 'ROUND_INTRO' ? 'Start first question' : phase === 'ROUND_COMPLETE' ? 'Next round' : phase === 'CORRECTION_REVEALED' && room.settings.leaderboardFrequency === 'question' ? 'Show leaderboard' : 'Next question';
  const uncertain = preview ? Object.entries(preview.results).filter(([, r]) => r.uncertain?.length) : [];
  const overrides = room.hostPrivate?.overrides?.[s.qKey] ?? {};

  return (
    <div className="flex flex-col gap-4">
      <Section title={phase === 'GAME_COMPLETE' ? 'Game complete!' : `${round?.title ?? ''}${pq ? ` · Question ${pq.numberInRound}/${round?.count}` : ''}`} icon={<MonitorPlay className="h-7 w-7" />} right={<span className="game-title rounded-full bg-black/30 px-4 py-1 text-sm">{phase.replace(/_/g, ' ')}{phase === 'PAUSED' && s.prevPhase ? ` (from ${s.prevPhase.replace(/_/g, ' ').toLowerCase()})` : ''}</span>}>
        {pq && effective !== 'ROUND_INTRO' && effective !== 'ROUND_COMPLETE' && phase !== 'GAME_COMPLETE' ? (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl bg-black/25 p-4">
              <p className="text-sm font-bold text-white/60">{pq.q.id} · {QTYPE_LABEL[pq.q.type]} · {pq.q.timeLimit}s · max {pq.q.points + (pq.q.speedBonus ?? 0)} pts</p>
              <p className="mt-1 text-lg font-extrabold">{pq.q.type === 'fill' ? pq.q.text : pq.q.prompt}</p>
              <div className="mt-3 rounded-xl bg-[#18b43c]/20 p-3 text-sm ring-1 ring-[#3dff7a]/50">
                <p className="font-extrabold text-[#3dff7a]">Answer key (teacher only)</p>
                <AnswerKey pq={pq} />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl bg-black/25 p-4">
              <div className="flex items-center justify-between">
                <span className="game-title text-xl">Submissions</span>
                <span className="game-title text-2xl tabular-nums">{Object.keys(subs).length} / {players.length}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#0a1450]"><div className="h-full bg-gradient-to-r from-[#38e1ff] to-[#7af5ff] transition-all" style={{ width: `${players.length ? (100 * Object.keys(subs).length) / players.length : 0}%` }} /></div>
              {phase === 'QUESTION_OPEN' && <p className="text-sm font-bold text-white/70">Timer: {Math.ceil(remainingMs / 1000)} s{remainingMs === 0 ? (room.settings.autoCloseOnTimeout ? ' — closing…' : ' — time is up; close submissions when ready') : ''} · {active.length} connected</p>}
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-auto scroll-thin">
                {players.map(([uid, p]) => (
                  <span key={uid} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold ${subs[uid] ? 'bg-[#18b43c]' : room.presence?.[uid] ? 'bg-white/15' : 'bg-white/5 text-white/40 line-through'}`} title={room.presence?.[uid] ? '' : 'offline'}>
                    {subs[uid] ? <Check className="h-3 w-3" /> : null}{p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : phase === 'GAME_COMPLETE' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Trophy className="h-16 w-16 text-[#ffd23f]" />
            <p className="text-lg font-extrabold">The podium is on the projector. Download the performance report for your records.</p>
            <div className="flex gap-3"><GameButton variant="yellow" onClick={onResults}><FolderOpen className="h-5 w-5" /> Export results</GameButton><GameButton variant="ghost" onClick={() => confirmAction('Start a new game room?') && onNewRoom()}><RefreshCw className="h-5 w-5" /> New game</GameButton></div>
          </div>
        ) : (
          <p className="py-4 text-center text-lg font-extrabold">{effective === 'ROUND_INTRO' ? `Showing the introduction to ${round?.title}.` : `${round?.title} is complete — leaderboards are on the projector.`}</p>
        )}
      </Section>

      {phase === 'SUBMISSIONS_CLOSED' && uncertain.length > 0 && pq?.q.type === 'fill' && (
        <Section title="Review typed answers before the correction" icon={<HelpCircle className="h-7 w-7 text-[#ffd23f]" />}>
          <p className="mb-2 text-sm text-white/75">These answers are close to an accepted answer but not exact. Accept or reject each one — nothing is accepted automatically.</p>
          <div className="flex flex-col gap-2">
            {uncertain.flatMap(([uid, r]) => r.uncertain!.map((b) => {
              const typed = (parseSubmission(subs[uid])?.answer as any)?.value?.[b] ?? '';
              const decided = overrides[uid]?.[b];
              return (
                <div key={`${uid}-${b}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/25 px-3 py-2">
                  <span className="font-extrabold">{room.players?.[uid]?.name}</span>
                  <span className="text-sm text-white/70">Blank {b + 1}:</span>
                  <span className="rounded bg-white px-2 font-mono font-bold text-[#14135a]">{typed}</span>
                  <span className="text-sm text-white/60">accepted: {(pq.q as any).blanks[b].accepted.join(', ')}</span>
                  <div className="ml-auto flex gap-2">
                    <GameButton variant={decided === true ? 'green' : 'ghost'} className="!px-3 !py-1 text-sm" onClick={() => run(() => setOverride(ctx.db, code, s.qKey, uid, b, decided === true ? null : true))}><Check className="h-4 w-4" /> Accept</GameButton>
                    <GameButton variant={decided === false ? 'red' : 'ghost'} className="!px-3 !py-1 text-sm" onClick={() => run(() => setOverride(ctx.db, code, s.qKey, uid, b, decided === false ? null : false))}><XCircle className="h-4 w-4" /> Reject</GameButton>
                  </div>
                </div>
              );
            }))}
          </div>
        </Section>
      )}

      <div className="neon-panel flex flex-wrap items-center justify-center gap-3 p-4">
        {can.resume
          ? <GameButton variant="yellow" disabled={busy} onClick={() => run(() => resume(ctx.db, code, room))}><Play className="h-5 w-5" /> Resume</GameButton>
          : <GameButton variant="navy" disabled={busy || !can.pause} onClick={() => run(() => pause(ctx.db, code, room))}><Pause className="h-5 w-5" /> Pause</GameButton>}
        <GameButton variant="navy" disabled={busy || !can.close} onClick={() => run(() => closeSubmissions(ctx.db, code, room))}><Lock className="h-5 w-5" /> Close submissions</GameButton>
        <GameButton variant="purple" disabled={busy || !can.reveal} onClick={() => run(() => reveal(ctx.db, code, room))}><Eye className="h-5 w-5" /> Reveal correction</GameButton>
        <GameButton variant="green" className="text-xl" disabled={busy || !can.next} onClick={() => run(() => advance(ctx.db, code, room))}><SkipForward className="h-6 w-6" /> {nextLabel}</GameButton>
        <GameButton variant="red" disabled={busy || !can.end} onClick={() => confirmAction('End the game now and show the final podium?') && run(() => endGame(ctx.db, code, room))}><Square className="h-5 w-5" /> End game</GameButton>
        <GameButton variant="ghost" onClick={onProjector}><MonitorPlay className="h-5 w-5" /> Projector</GameButton>
      </div>
      <p className="text-center text-xs text-white/60">The correct answer is never shown to students while submissions are open. {room.settings.autoRevealWhenAllSubmitted ? 'Correction is revealed automatically when every connected student has answered.' : 'Automatic reveal is off — use Reveal correction.'}</p>
    </div>
  );
}

function AnswerKey({ pq }: { pq: NonNullable<HostRoom['hostPrivate']>['questions'] extends (infer T)[] | undefined ? T : never }) {
  const q = pq.q;
  switch (q.type) {
    case 'mcq': case 'truefalse': {
      const i = correctDisplayIndex(pq);
      return <p className="font-bold">{LETTERS[i]} — {displayedOptions(pq)[i]}</p>;
    }
    case 'fill': return <ol className="list-decimal pl-5">{q.blanks.map((b, i) => <li key={i}>{b.accepted.join(' / ')}</li>)}</ol>;
    case 'numeric': return <p className="font-bold">{q.answer} {q.unit} (± {q.tolerance}{q.toleranceType === 'percent' ? '%' : ''})</p>;
    case 'density': return <p className="font-bold">{(q.mass / (q.waterAfter - q.waterBefore)).toFixed(2)} g/cm³</p>;
    case 'matching': return <ul>{q.pairs.map((p, i) => <li key={i}><b>{p.left}</b> → {p.right}</li>)}</ul>;
    case 'dragdrop': return <ol className="list-decimal pl-5">{q.zones.map((z) => <li key={z.id}>{z.answer}</li>)}</ol>;
    case 'atom': return <p className="font-bold">{q.symbol}: {q.shells.join(', ')}</p>;
  }
}

/**
 * Runs in the teacher's browser: auto-close/reveal when every connected student has answered,
 * optional close on timeout, and team placement for late joiners.
 */
export function useGameAutomation(code: string | null, room: HostRoom | null | undefined) {
  const fired = useRef<string>('');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!code || !room) return;
    const s = room.state;
    const d = db();
    // Late joiners → smallest team.
    if (s.phase !== 'LOBBY' && Object.values(room.players ?? {}).some((p) => !p.removed && !p.teamId)) placeUnassigned(d, code, room).catch(() => undefined);
    if (s.phase !== 'QUESTION_OPEN') return;
    const subs = ((room as any).submissions?.[s.qKey] ?? {}) as Record<string, Submission>;
    const active = activePlayers(room);
    const allIn = active.length > 0 && active.every((uid) => subs[uid]);
    const finish = (why: string) => {
      const key = `${s.qKey}:${why}`;
      if (fired.current === key) return;
      fired.current = key;
      const pq = room.hostPrivate?.questions?.[s.qIndex];
      // Typed answers that need the teacher's judgement → stop at "closed" for review.
      const needsReview = pq?.q.type === 'fill' && Object.values(gradeAll(room, subs).results).some((r) => r.uncertain?.length);
      const action = room.settings.autoRevealWhenAllSubmitted && !needsReview ? reveal(d, code, room) : closeSubmissions(d, code, room);
      action.catch(() => { fired.current = ''; });
    };
    if (allIn) finish('all');
    if (room.settings.autoCloseOnTimeout && typeof s.startedAt === 'number' && s.timeLimit) {
      const left = s.timeLimit * 1000 - ((s.accMs ?? 0) + (d.serverNow() - s.startedAt));
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => finish('timeout'), Math.max(0, left) + 300);
    }
    return () => { if (timeout.current) clearTimeout(timeout.current); };
  }, [code, room]);
}
