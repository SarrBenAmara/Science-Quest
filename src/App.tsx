import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { hasRealAddress } from './lib/env';

// Sandboxed previews have no page address, so navigation is kept in memory there.
const Router = hasRealAddress() ? HashRouter : MemoryRouter;
import { Background } from './components/Brand';
import Landing from './screens/Landing';
import { JoinScreen, StudentGame } from './screens/student/StudentApp';
import TeacherApp from './screens/teacher/TeacherApp';
import ProjectorPage from './screens/projector/Projector';
import { ConfigCheck } from './screens/ConfigCheck';
import { DemoBadge } from './screens/DemoBadge';
import { DemoReferee } from './screens/DemoReferee';

export default function App() {
  return (
    <Router>
      <Background />
      <DemoBadge />
      <DemoReferee />
      <ConfigCheck>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/play" element={<JoinScreen />} />
          <Route path="/play/:code" element={<StudentGame />} />
          <Route path="/teacher" element={<TeacherApp />} />
          <Route path="/projector/:code" element={<ProjectorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfigCheck>
    </Router>
  );
}
