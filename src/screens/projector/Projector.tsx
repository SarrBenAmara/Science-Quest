import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Atom, FlaskConical, Leaf, Trophy, Users, Maximize, PauseCircle, Crown, Home } from 'lucide-react';
import { getBackend } from '../../backend';
import { joinUrl, useHostRoom, useUser } from '../../hooks';
import { Logo, Persona } from '../../components/Brand';
import { Avatar, CountdownRing, IndividualLeaderboard, LAB_STYLE, ProgressDots, Stage, StatChip, TeamBadge, TeamLeaderboard, useRemaining } from '../../components/ui';
import { ProjectorQuestionBody } from '../../components/questions/ProjectorQuestion';
import { LabPortal } from '../Landing';
import { isIndividual, rankPlayers, rankTeams, type RankedPlayer, type RankedTeam } from '../../lib/game';
import type { HostRoom } from '../../game/host';
import type { Lab, RevealPayload, Team } from '../../lib/types';

const LAB_ICON: Record<Lab | 'mixed', typeof Leaf> = { biology: Leaf, physics: Atom, chemistry: FlaskConical, mixed: Trophy };

export default function ProjectorPage() {
  const { code = '' } = useParams();
  const user = useUser('host');
  const { room, error } = useHostRoom(user?.isTeacher ? code : null);
  if (user === undefined) return null;
  if (!user?.isTeacher) {
    return (
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo width={360} />
        <p className="game-title text-2xl">The projector view is for the teacher.</p>
        <Link to="/teacher" className="game-title rounded-full bg-[#173a9e] px-6 py-3 ring-2 ring-[#38e1ff]">Sign in to the Teacher Panel</Link>
      </div>
    );
  }
  if (error || room === null) return <div className="relative z-10 p-10 text-center game-title text-2xl">Room {code} was not found or is not yours.</div>;
  if (!room) return null;
  return <ProjectorView code={code} room={room} />;
}

function Header({ room, roundIdx, showQ }: { room: HostRoom; roundIdx: number; showQ: boolean }) {
  const round = room.plan.rounds[roundIdx];
  const players = Object.values(room.players ?? {}).filter((p) => !p.removed).length;
  const teams = Object.keys(room.teams ?? {}).length;
  const q = room.state.qIndex >= 0 ? room.hostPrivate?.questions?.[room.state.qIndex] : undefined;
  const Icon = round ? LAB_ICON[round.lab] : Atom;
  return (
    <>
      <div className="absolute left-[30px] top-[10px]"><Logo width={400} /></div>
      {round && (
        <div className="neon-panel absolute left-[560px] top-[26px] flex h-[120px] items-center !rounded-full pl-6 pr-4">
          <span className="mr-4 flex h-[84px] w-[84px] items-center justify-center rounded-full" style={{ boxShadow: `0 0 0 3px ${LAB_STYLE[round.lab].color}, 0 0 18px ${LAB_STYLE[round.lab].color}` }}><Icon className="h-12 w-12" style={{ color: LAB_STYLE[round.lab].color }} /></span>
          <div className="min-w-[360px] pr-6">
            <p className="game-title text-[40px] leading-tight">{round.title}</p>
            <p className="game-title text-[30px] leading-tight text-white/85">{round.subtitle}</p>
          </div>
          {showQ && q && (
            <div className="flex flex-col items-center border-l-2 border-[#38e1ff]/40 pl-8 pr-4">
              <span className="game-title text-[38px] not-italic">Question {q.numberInRound} / {round.count}</span>
              <ProgressDots total={round.count} current={q.numberInRound} className="text-[30px]" />
            </div>
          )}
        </div>
      )}
      <div className="absolute right-[30px] top-[30px] flex gap-5">
        <StatChip icon={<Users className="h-12 w-12" />} value={<span className="text-[44px]">{players}</span>} label="Players" className="h-[110px] px-6 [&_div.text-xs]:text-[22px]" />
        {!isIndividual(room.settings) && <StatChip icon={<Trophy className="h-12 w-12 text-[#ffd23f]" />} value={<span className="text-[44px]">{teams}</span>} label="Teams" className="h-[110px] px-6 [&_div.text-xs]:text-[22px]" />}
      </div>
    </>
  );
}

function SubmissionBar({ submitted, total, phase }: { submitted: number; total: number; phase: string }) {
  const msg = phase === 'QUESTION_OPEN' ? (submitted >= total && total > 0 ? 'Everyone has answered!' : 'Waiting for all players to answer…') : phase === 'PAUSED' ? 'Game paused' : phase === 'REVEALED' ? 'Correction revealed!' : 'Submissions closed';
  return (
    <div className="neon-panel flex h-[86px] items-center gap-6 !rounded-full px-8">
      <Users className="h-12 w-12 shrink-0" />
      <span className="game-title whitespace-nowrap text-[30px]">{msg}</span>
      <div className="h-6 min-w-[120px] flex-1 overflow-hidden rounded-full bg-[#0a1450] ring-2 ring-[#38e1ff]/50">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-[#38e1ff] to-[#7af5ff] shadow-[0_0_14px_#38e1ff]" animate={{ width: `${total ? (100 * submitted) / total : 0}%` }} />
      </div>
      <span className="game-title shrink-0 whitespace-nowrap text-[30px] not-italic tabular-nums">{submitted} / {total} submitted</span>
    </div>
  );
}

function ProjectorView({ code, room }: { code: string; room: HostRoom }) {
  const db = getBackend('host');
  const s = room.state;
  const players = room.players ?? {};
  const teams = room.teams ?? {};
  const scores = (room as any).scores ?? {};
  const ranked = useMemo(() => rankPlayers(players, scores), [players, scores]);
  const teamRanks = useMemo(() => rankTeams(teams, players, scores), [teams, players, scores]);
  const shownPhase = s.phase === 'PAUSED' ? s.prevPhase ?? 'LOBBY' : s.phase;
  const pq = s.qIndex >= 0 ? room.hostPrivate?.questions?.[s.qIndex] : undefined;
  const reveal: RevealPayload | null = (room as any).reveal && (room as any).reveal.qKey === s.qKey ? (room as any).reveal : null;
  const subs = ((room as any).submissions?.[s.qKey] ?? {}) as Record<string, unknown>;
  const activeIds = Object.entries(players).filter(([uid, p]) => !p.removed && (room.presence?.[uid] || subs[uid])).map(([uid]) => uid);
  const submitted = activeIds.filter((uid) => subs[uid]).length;
  const timerRunning = s.phase === 'QUESTION_OPEN';
  const { remainingMs, fraction } = useRemaining({ startedAt: s.startedAt, accMs: s.accMs, timeLimit: s.timeLimit }, db.serverNow, timerRunning);
  const showBoards = room.settings.leaderboardFrequency !== 'end';
  const solo = isIndividual(room.settings);

  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => undefined);

  return (
    <Stage>
      <button onClick={goFull} className="absolute bottom-3 right-3 z-30 rounded-full bg-white/10 p-3 opacity-40 transition hover:opacity-100" aria-label="Full screen"><Maximize className="h-8 w-8" /></button>
      <AnimatePresence mode="wait">
        <motion.div key={`${shownPhase}-${s.qIndex}-${shownPhase === 'CORRECTION_REVEALED'}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          {shownPhase === 'LOBBY' && <LobbyScreen code={code} room={room} />}
          {shownPhase === 'TEAM_ASSIGNMENT' && <TeamsScreen room={room} />}
          {shownPhase === 'ROUND_INTRO' && <RoundIntro room={room} />}
          {(shownPhase === 'QUESTION_OPEN' || shownPhase === 'SUBMISSIONS_CLOSED' || shownPhase === 'CORRECTION_REVEALED') && pq && (
            <>
              <Header room={room} roundIdx={s.roundIndex} showQ />
              {pq.q.type === 'mcq' || pq.q.type === 'truefalse' ? (
                <>
                  <div className={`absolute left-[10px] ${solo ? 'bottom-0 h-[860px]' : 'bottom-[330px] h-[540px]'}`}><Persona className="h-full w-auto" /></div>
                  <div className="absolute left-[330px] top-[200px]"><CountdownRing remainingMs={reveal ? 0 : remainingMs} fraction={reveal ? 0 : fraction} size={190} paused={s.phase === 'PAUSED'} /></div>
                  {showBoards && !solo && <TeamLeaderboard teams={teamRanks} className="absolute bottom-[30px] left-[30px] w-[520px] text-[30px]" />}
                  <div className="absolute left-[560px] right-[440px] top-[175px] bottom-[140px]"><ProjectorQuestionBody pq={pq} reveal={reveal} /></div>
                  {showBoards && <IndividualLeaderboard players={ranked} teams={teams} limit={10} className="absolute right-[24px] top-[200px] w-[400px] text-[26px]" />}
                  <div className="absolute bottom-[30px] left-[580px] right-[460px]"><SubmissionBar submitted={submitted} total={activeIds.length} phase={reveal ? 'REVEALED' : s.phase} /></div>
                </>
              ) : (
                <>
                  <div className="absolute bottom-0 left-[-20px] h-[860px]"><Persona className="h-full w-auto" /></div>
                  <div className="absolute left-[460px] right-[40px] top-[175px] bottom-[135px]"><ProjectorQuestionBody pq={pq} reveal={reveal} /></div>
                  <div className="absolute bottom-[30px] left-[480px] right-[250px]"><SubmissionBar submitted={submitted} total={activeIds.length} phase={reveal ? 'REVEALED' : s.phase} /></div>
                  <div className="absolute bottom-[8px] right-[40px]"><CountdownRing remainingMs={reveal ? 0 : remainingMs} fraction={reveal ? 0 : fraction} size={124} paused={s.phase === 'PAUSED'} /></div>
                </>
              )}
            </>
          )}
          {(shownPhase === 'LEADERBOARD' || shownPhase === 'ROUND_COMPLETE') && <LeaderboardScreen room={room} ranked={ranked} teamRanks={solo ? [] : teamRanks} roundDone={shownPhase === 'ROUND_COMPLETE'} hidden={!showBoards} />}
          {shownPhase === 'GAME_COMPLETE' && <Podium ranked={ranked} teamRanks={teamRanks} teams={teams} solo={solo} />}
        </motion.div>
      </AnimatePresence>
      {s.phase === 'PAUSED' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#050a24]/80 backdrop-blur">
          <PauseCircle className="h-48 w-48 text-[#38e1ff]" />
          <p className="game-title text-[90px]">Game paused</p>
        </div>
      )}
    </Stage>
  );
}

function LobbyScreen({ code, room }: { code: string; room: HostRoom }) {
  const players = Object.entries(room.players ?? {}).filter(([, p]) => !p.removed).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const url = joinUrl(code);
  return (
    <>
      <div className="absolute bottom-0 left-[-20px] h-[1000px]"><Persona className="h-full w-auto" /></div>
      <div className="absolute left-[560px] top-[20px]"><Logo width={620} /></div>
      <div className="neon-panel absolute left-[560px] right-[50px] top-[340px] flex items-center gap-10 p-8">
        <div className="rounded-3xl bg-white p-4"><QRCodeSVG value={url} size={260} /></div>
        <div className="flex-1">
          <p className="game-title text-[40px]">Join on your phone:</p>
          <p className="mt-1 break-all text-[30px] font-extrabold text-[#bfe9ff]">{url.replace(/\?code=\d+$/, '').replace(/^https?:\/\//, '')}</p>
          <p className="game-title mt-4 text-[36px]">Room code</p>
          <p className="font-display text-[150px] leading-none tracking-[0.12em] text-[#ffd23f] drop-shadow-[0_0_20px_rgba(255,210,63,0.7)]">{code}</p>
        </div>
      </div>
      <div className="absolute bottom-[40px] left-[560px] right-[50px] top-[760px] flex flex-wrap content-start gap-3 overflow-hidden">
        <AnimatePresence>
          {players.map(([uid, p]) => (
            <motion.span key={uid} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="chip flex items-center gap-2 !rounded-full px-4 py-2 text-[30px] font-extrabold">
              <Avatar name={p.name} size={40} /> {p.name}
            </motion.span>
          ))}
        </AnimatePresence>
        {!players.length && <p className="game-title text-[40px] text-white/70">Waiting for students to join…</p>}
      </div>
      <div className="absolute right-[50px] top-[60px]"><StatChip icon={<Users className="h-12 w-12" />} value={<span className="text-[56px]">{players.length}</span>} label="Players joined" className="px-8 py-4 [&_div.text-xs]:text-[22px]" /></div>
    </>
  );
}

function TeamsScreen({ room }: { room: HostRoom }) {
  const teams = Object.entries(room.teams ?? {}).sort((a, b) => a[1].order - b[1].order);
  return (
    <>
      <div className="absolute left-[30px] top-[10px]"><Logo width={400} /></div>
      <p className="game-title absolute left-0 right-0 top-[60px] text-center text-[80px]">Meet the teams!</p>
      <div className="absolute bottom-[40px] left-[40px] right-[40px] top-[230px] grid gap-6" style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(0, 1fr))` }}>
        {teams.map(([tid, t], i) => {
          const members = Object.values(room.players ?? {}).filter((p) => !p.removed && p.teamId === tid);
          return (
            <motion.div key={tid} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.2 }} className="neon-panel flex flex-col items-center gap-4 p-6" style={{ borderColor: t.color, boxShadow: `0 0 26px ${t.color}` }}>
              <TeamBadge teamId={tid} team={t} size={110} />
              <p className="game-title text-[50px]">{t.name}</p>
              <div className="flex w-full flex-col gap-2 overflow-hidden">
                {members.map((m) => <div key={m.nameKey} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2 text-[30px] font-extrabold"><Avatar name={m.name} size={40} />{m.name}</div>)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

const PORTAL_FOR: Record<Lab | 'mixed', Parameters<typeof LabPortal>[0]> = {
  biology: { name: 'BIOLOGY', from: '#7dff5a', to: '#1a9e1f', glow: '#49ff4a', Icon: Leaf },
  physics: { name: 'PHYSICS', from: '#5ec8ff', to: '#1458e0', glow: '#38b6ff', Icon: Atom },
  chemistry: { name: 'CHEMISTRY', from: '#d58bff', to: '#6a17c4', glow: '#c25bff', Icon: FlaskConical },
  mixed: { name: 'FINAL', from: '#ffe066', to: '#c27a00', glow: '#ffc21a', Icon: Trophy },
};

function RoundIntro({ room }: { room: HostRoom }) {
  const r = room.plan.rounds[room.state.roundIndex];
  if (!r) return null;
  return (
    <>
      <div className="absolute bottom-0 left-[-20px] h-[1000px]"><Persona className="h-full w-auto" /></div>
      <div className="absolute left-[30px] top-[10px]"><Logo width={400} /></div>
      <div className="absolute left-[620px] top-[220px]"><LabPortal {...PORTAL_FOR[r.lab]} size={1.6} /></div>
      <motion.div initial={{ x: 200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="absolute right-[60px] top-[300px] w-[640px] text-center">
        <p className="game-title text-[44px] text-white/80">Round {room.state.roundIndex + 1} of {room.plan.rounds.length}</p>
        <p className="game-title text-[84px] leading-tight" style={{ color: LAB_STYLE[r.lab].color, textShadow: `0 0 30px ${LAB_STYLE[r.lab].color}` }}>{r.title.replace(/^Round \d+:\s*/, '')}</p>
        <p className="game-title mt-3 text-[44px]">{r.subtitle}</p>
        <p className="mt-8 text-[36px] font-extrabold text-white/80">{r.count} challenges · Get ready!</p>
      </motion.div>
    </>
  );
}

function LeaderboardScreen({ room, ranked, teamRanks, roundDone, hidden }: { room: HostRoom; ranked: RankedPlayer[]; teamRanks: RankedTeam[]; roundDone: boolean; hidden: boolean }) {
  const r = room.plan.rounds[room.state.roundIndex];
  return (
    <>
      <Header room={room} roundIdx={room.state.roundIndex} showQ={false} />
      <div className="absolute bottom-0 left-[-20px] h-[860px]"><Persona className="h-full w-auto" /></div>
      <p className="game-title absolute left-[500px] right-0 top-[180px] text-center text-[64px]">{roundDone ? `${r?.title ?? 'Round'} complete!` : 'Leaderboard'}</p>
      {hidden ? (
        <p className="game-title absolute left-[500px] right-0 top-[480px] text-center text-[50px] text-white/80">Rankings will be revealed at the end…</p>
      ) : (
        <div className={`absolute bottom-[50px] left-[520px] right-[50px] top-[300px] grid gap-10 ${teamRanks.length ? 'grid-cols-2' : 'grid-cols-[1fr_minmax(0,900px)_1fr] [&>*:last-child]:col-start-2'}`}>
          {teamRanks.length > 0 && <TeamLeaderboard teams={teamRanks} className="self-start text-[38px]" />}
          <IndividualLeaderboard players={ranked} teams={room.teams ?? {}} limit={10} className="text-[30px]" />
        </div>
      )}
    </>
  );
}

function Podium({ ranked, teamRanks, teams, solo = false }: { ranked: RankedPlayer[]; teamRanks: RankedTeam[]; teams: Record<string, Team>; solo?: boolean }) {
  const [view, setView] = useState<'individual' | 'team'>('individual');
  useEffect(() => {
    const fire = () => confetti({ particleCount: 160, spread: 100, origin: { y: 0.3 }, colors: ['#ffd23f', '#38e1ff', '#a24bff', '#3dff7a', '#ff4fd8'] });
    fire();
    const t = setInterval(fire, 4000);
    const v = setInterval(() => { if (!solo) setView((x) => (x === 'individual' ? 'team' : 'individual')); }, 14000);
    return () => { clearInterval(t); clearInterval(v); };
  }, []);
  const top = view === 'individual'
    ? ranked.slice(0, 3).map((p) => ({ key: p.uid, name: p.name, total: p.total, sub: p.teamId ? teams[p.teamId]?.name : '' }))
    : teamRanks.slice(0, 3).map((t) => ({ key: t.teamId, name: t.name, total: t.total, sub: t.members.join(', ') }));
  const rest = view === 'individual' ? ranked.slice(3, 8).map((p) => ({ key: p.uid, rank: p.rank, name: p.name, total: p.total })) : teamRanks.slice(3).map((t) => ({ key: t.teamId, rank: t.rank, name: t.name, total: t.total }));
  const slots = [
    { i: 1, h: 230, x: 450, grad: 'from-[#e9eef8] to-[#8592ad]', label: '2', ring: '#dfe6f5' },
    { i: 0, h: 300, x: 770, grad: 'from-[#ffe066] to-[#d48a00]', label: '1', ring: '#ffd23f' },
    { i: 2, h: 180, x: 1090, grad: 'from-[#ffc49a] to-[#b0612e]', label: '3', ring: '#f0a070' },
  ];
  return (
    <>
      <div className="absolute left-[30px] top-[10px]"><Logo width={400} /></div>
      <div className="absolute bottom-0 left-[-20px] h-[900px]"><Persona className="h-full w-auto" /></div>
      <div className="neon-panel absolute left-[620px] top-[40px] flex h-[150px] w-[680px] items-center justify-center !rounded-full">
        <Trophy className="absolute -top-14 h-24 w-24 text-[#ffd23f] drop-shadow-[0_0_20px_#ffd23f]" />
        <p className="game-title text-[84px]">{view === 'individual' ? 'Final Results' : 'Team Champions'}</p>
      </div>
      {slots.map((sl) => {
        const p = top[sl.i];
        if (!p) return null;
        return (
          <motion.div key={`${view}-${sl.i}`} initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 + (2 - sl.i) * 0.4, type: 'spring' }} className="absolute bottom-[110px] flex w-[300px] flex-col items-center" style={{ left: sl.x }}>
            {sl.i === 0 && <Crown className="h-20 w-20 text-[#ffd23f] drop-shadow-[0_0_14px_#ffd23f]" />}
            <div className="rounded-full p-2" style={{ boxShadow: `0 0 0 6px ${sl.ring}, 0 0 40px ${sl.ring}` }}>
              {view === 'individual' ? <Avatar name={p.name} size={sl.i === 0 ? 170 : 140} /> : <TeamBadge teamId={p.key} team={teams[p.key]} size={sl.i === 0 ? 170 : 140} />}
            </div>
            <div className="game-title mt-3 max-w-[320px] rounded-2xl bg-[#0d1a5c] px-5 py-1 text-center text-[38px] leading-tight ring-2 ring-[#38e1ff]">{p.name}</div>
            <div className="game-title mt-1 rounded-2xl bg-white px-6 text-[46px] not-italic text-[#0d1a5c]">{p.total.toLocaleString('en-GB')}</div>
            {view === 'team' && <div className="mt-1 line-clamp-2 text-center text-[20px] font-extrabold text-white/85">{p.sub}</div>}
            <div className={`mt-3 flex w-full items-center justify-center rounded-t-2xl bg-gradient-to-b ${sl.grad}`} style={{ height: sl.h, boxShadow: `0 0 30px ${sl.ring}` }}>
              <span className="font-display text-[150px] text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]">{sl.label}</span>
            </div>
          </motion.div>
        );
      })}
      {rest.length > 0 && (
        <div className="neon-panel absolute right-[40px] top-[240px] w-[440px] p-5">
          <p className="game-title mb-3 flex items-center gap-3 text-[40px]"><Users className="h-10 w-10" /> {view === 'individual' ? 'Top Competitors' : 'Other teams'}</p>
          <div className="flex flex-col gap-3">
            {rest.map((r) => (
              <div key={r.key} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 text-[#0d1a5c]">
                <span className="game-title flex h-12 w-12 items-center justify-center rounded-full bg-[#2f6bff] text-[28px] not-italic text-white">{r.rank}</span>
                <span className="flex-1 truncate text-[30px] font-extrabold">{r.name}</span>
                <span className="game-title text-[30px] not-italic">{r.total.toLocaleString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="neon-panel absolute bottom-[24px] left-[680px] flex items-center gap-3 !rounded-full px-10 py-3">
        <Home className="h-10 w-10" /><span className="game-title text-[40px]">Thanks for playing!</span>
      </div>
    </>
  );
}
