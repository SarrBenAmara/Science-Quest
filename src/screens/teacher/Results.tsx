import { useMemo } from 'react';
import { BarChart3, Download, FileDown } from 'lucide-react';
import { GameButton, IndividualLeaderboard, TeamLeaderboard } from '../../components/ui';
import { buildReport, reportCsv } from '../../lib/report';
import { isIndividual, rankPlayers, rankTeams } from '../../lib/game';
import { LAB_LABEL, QTYPE_LABEL } from '../../lib/types';
import type { HostRoom } from '../../game/host';
import { download, Section } from './common';

export function useReport(room: HostRoom | null | undefined) {
  return useMemo(() => {
    if (!room?.hostPrivate?.questions) return null;
    return buildReport(room.hostPrivate.questions, room.players ?? {}, room.teams ?? {}, (room as any).results ?? {});
  }, [room]);
}

const pctClass = (p: number) => (p >= 70 ? 'text-[#3dff7a]' : p >= 50 ? 'text-[#ffd23f]' : 'text-[#ff6b8b]');

export function LiveResults({ room }: { room: HostRoom | null | undefined }) {
  const report = useReport(room);
  const scores = (room as any)?.scores ?? {};
  const ranked = useMemo(() => rankPlayers(room?.players ?? {}, scores), [room, scores]);
  const teams = useMemo(() => rankTeams(room?.teams ?? {}, room?.players ?? {}, scores), [room, scores]);
  if (!room) return <Section title="Live Results"><p className="text-white/70">No game yet.</p></Section>;
  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-4 ${isIndividual(room.settings) ? '' : 'lg:grid-cols-[1fr_1.4fr]'}`}>
        {!isIndividual(room.settings) && <TeamLeaderboard teams={teams} className="self-start text-lg" />}
        <IndividualLeaderboard players={ranked} teams={room.teams ?? {}} limit={200} title="ALL PLAYERS" className="text-base" />
      </div>
      {report && report.questions.length > 0 && (
        <Section title="Questions so far" icon={<BarChart3 className="h-7 w-7" />}>
          <div className="overflow-auto scroll-thin">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-white/70"><th className="p-2">Q</th><th className="p-2">Lab</th><th className="p-2">Type</th><th className="p-2">Topic</th><th className="p-2">Class average</th><th className="p-2">Fully correct</th><th className="p-2">Answered</th></tr></thead>
              <tbody>{report.questions.map((q) => (
                <tr key={q.id} className="border-t border-white/10"><td className="p-2 font-extrabold">{q.id}</td><td className="p-2">{LAB_LABEL[q.lab]}</td><td className="p-2">{QTYPE_LABEL[q.type]}</td><td className="p-2">{q.topic}</td><td className={`p-2 font-extrabold ${pctClass(q.avgPct)}`}>{q.avgPct}%</td><td className="p-2">{q.fullyCorrect}</td><td className="p-2">{q.answered}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

export function ExportPanel({ room, code }: { room: HostRoom | null | undefined; code: string | null }) {
  const report = useReport(room);
  if (!room || !report || !room.hostPrivate?.questions) return <Section title="Export Results"><p className="text-white/70">Results appear here once the game has started.</p></Section>;
  const date = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <Section title="Student Performance Report" icon={<FileDown className="h-7 w-7" />} right={
        <div className="flex gap-2">
          <GameButton variant="yellow" onClick={() => download(`science-quest-report-${code}-${date}.csv`, reportCsv(report, room.hostPrivate!.questions!), 'text/csv')}><Download className="h-5 w-5" /> Download CSV</GameButton>
          <GameButton variant="ghost" onClick={() => download(`science-quest-raw-${code}-${date}.json`, JSON.stringify({ code, players: room.players, teams: room.teams, results: (room as any).results, questions: room.hostPrivate!.questions!.map((p) => p.q) }, null, 2), 'application/json')}>Raw data (JSON)</GameButton>
        </div>
      }>
        <div className="overflow-auto scroll-thin">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-white/70"><th className="p-2">#</th><th className="p-2">Student</th><th className="p-2">Team</th><th className="p-2">Score</th><th className="p-2">Correct</th><th className="p-2">Incorrect</th><th className="p-2">Biology</th><th className="p-2">Physics</th><th className="p-2">Chemistry</th><th className="p-2">Revise</th></tr></thead>
            <tbody>{report.rows.map((r) => (
              <tr key={r.rank} className="border-t border-white/10">
                <td className="p-2">{r.rank}</td><td className="p-2 font-extrabold">{r.name}</td><td className="p-2">{r.team}</td><td className="p-2">{r.total}</td><td className="p-2">{r.correct}</td><td className="p-2">{r.incorrect}</td>
                {(['biology', 'physics', 'chemistry'] as const).map((l) => <td key={l} className={`p-2 font-extrabold ${r.labs[l].max ? pctClass(r.labs[l].pct) : 'text-white/40'}`}>{r.labs[l].max ? `${r.labs[l].pct}%` : '—'}</td>)}
                <td className="p-2 text-xs">{r.revise.join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-white/60">“Revise” lists questions where the student got less than half of the parts right (or did not answer). The CSV also contains performance by question type and a class summary per question.</p>
      </Section>
    </div>
  );
}
