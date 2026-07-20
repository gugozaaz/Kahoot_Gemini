import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HostView from './HostView';
import PlayerView from './PlayerView';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PlayerView />} />
        <Route path="/host" element={<HostView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
