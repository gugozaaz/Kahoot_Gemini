import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeView from './HomeView';
import DashboardView from './DashboardView';
import CreatorView from './CreatorView';
import HostView from './HostView';
import PlayerView from './PlayerView';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/creator/:id" element={<CreatorView />} />
        <Route path="/host/:id" element={<HostView />} />
        <Route path="/play" element={<PlayerView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
