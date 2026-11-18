import { useEffect } from 'react';
import { IS_DEMO } from '../backend';
import { useHostRoom, useListen, useUser } from '../hooks';
import { runDemoStudents } from '../game/demoBots';
import { useGameAutomation } from './teacher/TeacherApp';

/** Demo only: keeps the teacher's referee and the simulated students running in every view. */
export function DemoReferee() {
  if (!IS_DEMO) return null;
  return <Inner />;
}

function Inner() {
  const user = useUser('host');
  const active = useListen<string | null>('host', user?.isTeacher ? `teachers/${user.uid}/activeRoom` : null, null);
  const { room } = useHostRoom(active);
  useGameAutomation(active, room);
  useEffect(() => { if (active && room) runDemoStudents(active, room); }, [active, room]);
  return null;
}
