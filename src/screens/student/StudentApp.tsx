import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, X, Trophy, Coins, Users, Lightbulb, Hand, PencilLine, Link2, Atom, Calculator, FlaskConical, PauseCircle, LogIn } from 'lucide-react';
import { getBackend } from '../../backend';
import { usePlayerRoom, useUser } from '../../hooks';
import { Logo } from '../../components/Brand';
import { GameButton, ProgressDots, Spinner, TeamBadge, ANSWER_STYLE, LAB_STYLE, useToast } from '../../components/ui';
import { StudentControls } from '../../components/questions/StudentControls';
import { joinRoom, JOIN_ERROR_TEXT, lastRoom, rememberRoom, submitAnswer, trackPresence } from '../../game/player';
import { isIndividual, rankPlayers, rankTeams } from '../../lib/game';
import type { Answer, PublicQuestion } from '../../lib/types';

const db = () => getBackend('player');

function PhoneShell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col gap-4 overflow-x-hidden px-4 pb-10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <Logo width={190} />
        {header}
      </div>
      {children}
    </div>
  );
}

export function JoinScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const user = useUser('player');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Automatic re-join after a refresh or a dropped connection.
  useEffect(() => {
    const last = lastRoom();
    if (!user || !last || params.get('code')) return;
    db().get(`rooms/${last}/players/${user.uid}`).then((p) => { if (p && !p.removed) nav(`/play/${last}`, { replace: true }); }).catch(() => undefined);
  }, [user, nav, params]);

  const submit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (busy || code.length !== 6 || !name.trim()) return;
    setBusy(true); setErr(null);
    const res = await joinRoom(db(), code, name);
    setBusy(false);
    if (res.ok) nav(`/play/${res.code}`, { replace: true });
    else setErr(JOIN_ERROR_TEXT[res.error]);
  };

  return (
    <PhoneShell>
      <form onSubmit={submit} onKeyDown={(e) => e.key === 'Enter' && submit(e)} className="neon-panel mt-6 flex flex-col gap-5 p-5">
        <h1 className="game-title text-center text-3xl">Join the game</h1>
        <label className="flex flex-col gap-2">
          <span className="font-extrabold">Room code</span>
          <input className="sq-input text-center text-3xl tracking-[0.3em]" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label="Room code" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-extrabold">Your name</span>
          <input className="sq-input" maxLength={20} autoComplete="nickname" placeholder="e.g. Youssef B." value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        </label>
        {err && <p role="alert" className="rounded-xl bg-[#e8164f]/90 px-3 py-2 text-center font-extrabold">{err}</p>}
        <GameButton variant="yellow" type="button" onClick={submit} className="py-4 text-3xl" disabled={busy || code.length !== 6 || !name.trim()}>
          {busy ? <Spinner /> : <LogIn className="h-8 w-8" />} Let&apos;s go!
        </GameButton>
        <p className="text-center text-xs text-white/60">No account needed. Use your real name so your teacher can see your results.</p>
      </form>
    </PhoneShell>
  );
}

const TYPE_HINT: Partial<Record<PublicQuestion['type'], { icon: typeof Hand; text: string }>> = {
  dragdrop: { icon: Hand, text: 'Drag and drop the labels into the correct boxes.' },
  fill: { icon: PencilLine, text: 'Fill in the blanks' },
  matching: { icon: Link2, text: 'Match each term to its description.' },
  atom: { icon: Atom, text: 'Build the atom: put the electrons in the shells.' },
  numeric: { icon: Calculator, text: 'Type your calculated answer.' },
  density: { icon: FlaskConical, text: 'Measure, then calculate the density.' },
};

function Waiting({ title, sub }: { title: string; sub?: string }) {
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="neon-panel flex flex-col items-center gap-3 p-6 text-center">
      <Spinner className="h-10 w-10" />
      <p className="game-title text-2xl">{title}</p>
      {sub && <p className="font-bold text-white/75">{sub}</p>}
    </motion.div>
  );
}

export function StudentGame() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const user = useUser('player');
  const uid = user?.uid ?? null;
  const room = usePlayerRoom(code, uid);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{ q: number; a: Answer } | null>(null);

  const me = uid ? room.players[uid] : undefined;
  useEffect(() => { if (uid && me && !me.removed) return trackPresence(db(), code, uid); }, [uid, code, !!me, me?.removed]);
  useEffect(() => { if (me?.removed) rememberRoom(null); }, [me?.removed]);

  const ranked = useMemo(() => rankPlayers(room.players, room.scores), [room.players, room.scores]);
  const teamRanks = useMemo(() => rankTeams(room.teams, room.players, room.scores), [room.teams, room.players, room.scores]);
  const myRank = ranked.find((r) => r.uid === uid);
  const myTeam = me?.teamId ? room.teams[me.teamId] : undefined;
  const myTeamRank = teamRanks.find((t) => t.teamId === me?.teamId);
  const s = room.state;
  const round = s && room.plan?.rounds?.[s.roundIndex];

  if (user === undefined) return <PhoneShell><Waiting title="Connecting…" /></PhoneShell>;
  // Not part of this room (e.g. opened a shared link) → join form with the code filled in.
  if (!user || (room.playersLoaded && !me)) return <JoinRedirect code={code} />;
  if (!s || !me) return <PhoneShell><Waiting title="Connecting…" sub="Checking the room code" /></PhoneShell>;
  if (me.removed) {
    return (
      <PhoneShell>
        <div className="neon-panel p-6 text-center"><p className="game-title text-2xl">You have left this game</p><p className="mt-2 font-bold text-white/70">Your teacher removed this player. Ask them if this was a mistake.</p></div>
        <GameButton onClick={() => nav('/play')}>Join another game</GameButton>
      </PhoneShell>
    );
  }

  const qNum = room.question?.numberInRound ?? 0;
  const header = round && s.qIndex >= 0 && s.phase !== 'LOBBY' && s.phase !== 'TEAM_ASSIGNMENT' ? (
    <div className="chip flex flex-col items-center px-3 py-1.5">
      <span className="game-title text-xl leading-none">Q{qNum} / {round.count}</span>
      <ProgressDots total={round.count} current={qNum} className="mt-1 text-[11px]" />
    </div>
  ) : null;

  const submit = async (a: Answer) => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await submitAnswer(db(), code, s.qKey, uid, a, !!(me.adapted && room.question?.adapted));
      setLastAnswer({ q: s.qIndex, a });
    } catch {
      toast.err('Too late — submissions are closed.');
    } finally { setBusy(false); }
  };

  const submitted = !!room.mySubmission && s.qIndex === room.question?.index;
  const q = room.question;

  return (
    <PhoneShell header={header}>
      {toast.node}
      <div className="grid grid-cols-2 gap-3">
        {isIndividual(room.settings) ? (
          <div className="chip flex items-center justify-center gap-2 px-2 py-2">
            <Users className="h-7 w-7 shrink-0 text-white" />
            <div className="leading-tight"><div className="game-title truncate text-base">{me.name}</div><div className="text-xs font-extrabold text-white/70">Solo player{myRank && Object.keys(room.scores).length ? ` · #${myRank.rank}` : ''}</div></div>
          </div>
        ) : (
          <div className="chip flex items-center justify-center gap-2 px-2 py-2">
            <Users className="h-7 w-7 shrink-0 text-white" />
            <span className="game-title line-clamp-2 text-base leading-tight">{myTeam ? myTeam.name : 'Team —'}</span>
            {myTeam && <TeamBadge teamId={me.teamId} team={myTeam} size={24} />}
          </div>
        )}
        <div className="chip flex items-center justify-center gap-2 px-2 py-2">
          <Trophy className="h-7 w-7 shrink-0 text-[#ffd23f]" />
          <div className="leading-tight"><div className="game-title text-sm">Score</div><div className="game-title text-xl tabular-nums text-[#ffd23f]">{(room.scores[uid!]?.total ?? 0).toLocaleString('en-GB')}</div></div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${s.phase}-${s.qIndex}-${submitted}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-col gap-4">
          {s.phase === 'LOBBY' && <Waiting title={`You're in, ${me.name}!`} sub="Waiting for Mrs Sarra to start the game. Watch the big screen." />}

          {s.phase === 'TEAM_ASSIGNMENT' && (
            <div className="neon-panel flex flex-col items-center gap-3 p-6 text-center">
              <p className="font-extrabold text-white/80">Your team is…</p>
              {myTeam ? <><TeamBadge teamId={me.teamId} team={myTeam} size={90} /><p className="game-title text-4xl">{myTeam.name}</p></> : <Spinner />}
              <p className="font-bold text-white/70">Find your teammates! The game starts soon.</p>
            </div>
          )}

          {s.phase === 'ROUND_INTRO' && round && (
            <div className="neon-panel flex flex-col items-center gap-2 p-6 text-center" style={{ borderColor: LAB_STYLE[round.lab].color }}>
              <p className="game-title text-3xl" style={{ color: LAB_STYLE[round.lab].color }}>{round.title}</p>
              <p className="font-bold">{round.subtitle}</p>
              <p className="mt-2 text-white/70">Get ready — {round.count} questions. Read each question on the big screen.</p>
            </div>
          )}

          {s.phase === 'PAUSED' && <div className="neon-panel flex flex-col items-center gap-2 p-6 text-center"><PauseCircle className="h-14 w-14" /><p className="game-title text-2xl">Game paused</p><p className="text-white/70">Wait for your teacher.</p></div>}

          {s.phase === 'QUESTION_OPEN' && q && q.index === s.qIndex && !submitted && (
            <>
              {(TYPE_HINT[q.type] && !(me.adapted && q.adapted)) && (() => { const H = TYPE_HINT[q.type]!; return (
                <div className="lilac-bar flex items-center gap-3 px-3 py-2">
                  <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-[#6a2bd9] to-[#3a1499]"><H.icon className="h-7 w-7 text-white" /></span>
                  <p className="game-title flex-1 text-center text-lg leading-tight">{H.text}</p>
                </div>
              ); })()}
              {(q.type === 'mcq' || q.type === 'truefalse') && !(me.adapted && q.adapted) && <p className="text-center font-extrabold text-white/80">Read the question on the big screen, then tap your answer.</p>}
              <StudentControls q={q} onSubmit={submit} busy={busy} adapted={!!(me.adapted && q.adapted)} />
            </>
          )}

          {s.phase === 'QUESTION_OPEN' && submitted && (
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="neon-panel flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#18b43c] shadow-[0_0_24px_#3dff7a]"><Check className="h-12 w-12" /></span>
              <p className="game-title text-3xl">Answer locked in!</p>
              {lastAnswer?.q === s.qIndex && lastAnswer.a.kind === 'choice' && (q?.type === 'mcq' || q?.type === 'truefalse') && <p className="font-extrabold">You chose <span className="game-title rounded-full px-3 py-1" style={{ background: ANSWER_STYLE[lastAnswer.a.value].glow }}>{'ABCD'[lastAnswer.a.value]}</span></p>}
              <p className="flex items-center gap-2 font-bold text-white/75"><Spinner className="h-5 w-5" /> Waiting for everyone to answer…</p>
            </motion.div>
          )}

          {s.phase === 'SUBMISSIONS_CLOSED' && <Waiting title="Time's up!" sub={submitted ? 'Your answer is in. The correction is coming…' : 'Submissions are closed. The correction is coming…'} />}

          {s.phase === 'CORRECTION_REVEALED' && room.reveal && room.reveal.qKey === s.qKey && <Correction reveal={room.reveal} result={room.myResult} adapted={!!room.myResult?.adapted} total={room.scores[uid!]?.total ?? 0} />}

          {(s.phase === 'LEADERBOARD' || s.phase === 'ROUND_COMPLETE') && (
            <div className="neon-panel flex flex-col items-center gap-3 p-6 text-center">
              {s.phase === 'ROUND_COMPLETE' && <p className="game-title text-2xl text-[#ffd23f]">{round?.title} complete!</p>}
              {room.settings?.leaderboardFrequency === 'end' ? (
                <p className="font-bold">Rankings will be revealed at the end. Keep going!</p>
              ) : (
                <>
                  <p className="font-bold text-white/80">You are</p>
                  <p className="game-title text-6xl text-[#ffd23f]">#{myRank?.rank ?? '–'}</p>
                  <p className="font-bold">out of {ranked.length} players</p>
                  {myTeamRank && <p className="flex items-center gap-2 font-extrabold"><TeamBadge teamId={me.teamId} team={myTeam} size={24} /> {myTeamRank.name} is #{myTeamRank.rank}</p>}
                </>
              )}
              <p className="flex items-center gap-2 text-sm font-bold text-white/60"><Spinner className="h-4 w-4" /> Waiting for the next question…</p>
            </div>
          )}

          {s.phase === 'GAME_COMPLETE' && (
            <div className="neon-panel flex flex-col items-center gap-3 p-6 text-center">
              <Trophy className="h-16 w-16 text-[#ffd23f]" />
              <p className="game-title text-3xl">Final results</p>
              <p className="game-title text-6xl text-[#ffd23f]">#{myRank?.rank ?? '–'}</p>
              <p className="font-extrabold">{(room.scores[uid!]?.total ?? 0).toLocaleString('en-GB')} points · {room.scores[uid!]?.correct ?? 0} fully correct</p>
              {myTeamRank && <p className="font-extrabold">{myTeamRank.name}: #{myTeamRank.rank} with {myTeamRank.total.toLocaleString('en-GB')} points</p>}
              <p className="text-white/70">Well done, scientist! Look at the big screen for the podium.</p>
              <GameButton variant="navy" onClick={() => { rememberRoom(null); nav('/'); }}>Back to menu</GameButton>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </PhoneShell>
  );
}

function JoinRedirect({ code }: { code: string }) {
  const nav = useNavigate();
  useEffect(() => { nav(`/play?code=${code}`, { replace: true }); }, [code, nav]);
  return null;
}

function Correction({ reveal, result, adapted, total }: { reveal: NonNullable<ReturnType<typeof usePlayerRoom>['reveal']>; result: ReturnType<typeof usePlayerRoom>['myResult']; adapted: boolean; total: number }) {
  const answered = !!result?.answered;
  const full = !!result?.correct;
  const partial = !full && (result?.partsCorrect ?? 0) > 0;
  const letter = adapted ? reveal.adapted?.correctLetter : reveal.correctLetter;
  const text = adapted ? reveal.adapted?.correctText : reveal.correctText;
  const status = full ? { label: 'Correct Answer!', cls: 'from-[#14b83f] to-[#0a6e25]', ring: '#3dff7a', Icon: Check }
    : partial ? { label: `Partly correct: ${result!.partsCorrect}/${result!.partsTotal}`, cls: 'from-[#f5b301] to-[#b07300]', ring: '#ffd23f', Icon: Check }
    : { label: answered ? 'Incorrect Answer!' : 'No answer', cls: 'from-[#e8164f] to-[#8a0b2a]', ring: '#ff5c7f', Icon: X };
  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className={`flex items-center gap-3 rounded-full bg-gradient-to-b ${status.cls} px-3 py-3`} style={{ boxShadow: `0 0 0 3px ${status.ring}, 0 0 24px ${status.ring}` }}>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/80"><status.Icon className="h-9 w-9" strokeWidth={3.5} /></span>
        <span className="game-title text-[26px] leading-tight">{status.label}</span>
      </motion.div>
      <div className="flex items-center gap-4 rounded-[28px] bg-gradient-to-b from-[#14c745] to-[#0a7d2a] px-4 py-4 shadow-[0_0_0_3px_#3dff7a,0_0_24px_#3dff7a]">
        {letter && <span className="game-title flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-4xl not-italic ring-4 ring-white">{letter}</span>}
        <div className="flex-1">
          {reveal.parts && !adapted && reveal.type !== 'atom' ? (
            <ol className="list-decimal pl-5 text-lg font-extrabold">{reveal.parts.map((p, i) => <li key={i}>{p}</li>)}</ol>
          ) : <p className="game-title text-center text-3xl leading-tight">{text}</p>}
        </div>
      </div>
      <div className="relative mt-3">
        <span className="game-title absolute -top-5 left-3 z-10 flex items-center gap-1 rounded-full bg-gradient-to-b from-[#ffe25a] to-[#ffb21a] px-4 py-1 text-xl text-[#14135a] shadow-[0_0_12px_#ffc21a]"><Lightbulb className="h-6 w-6" /> Explanation</span>
        <div className="glass-white px-4 pb-4 pt-7 text-lg font-extrabold leading-snug">{reveal.explanation || '—'}</div>
      </div>
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="mx-auto flex items-center gap-3 rounded-full bg-gradient-to-b from-[#4a1fb8] to-[#22106e] px-8 py-3 shadow-[0_0_0_3px_#c78bff,0_0_20px_rgba(162,75,255,0.7)]">
        {result?.points ? <Trophy className="h-9 w-9 text-[#ffd23f]" /> : <Coins className="h-9 w-9 text-[#ffd23f]" />}
        <span className="game-title text-3xl"><span className="text-[#ffd23f]">+{result?.points ?? 0}</span> Points</span>
      </motion.div>
      <p className="text-center font-extrabold text-white/80">Total score: {total.toLocaleString('en-GB')}</p>
      <div className="mx-auto flex items-center gap-3 rounded-full bg-[#0b1a5c] px-6 py-3 ring-2 ring-[#38e1ff] shadow-[0_0_16px_rgba(56,225,255,0.5)]">
        <Spinner className="h-6 w-6" />
        <span className="game-title text-lg">Waiting for the next question…</span>
      </div>
    </div>
  );
}
