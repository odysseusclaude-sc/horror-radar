import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Database from "./pages/Database";
import RadarPick from "./pages/radar/SignalFire";
import Autopsy from "./pages/game/ConceptA";
import Trends from "./pages/Trends";
import Developer from "./pages/Developer";

export default function App() {
  return (
    <BrowserRouter>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="flex flex-col min-h-screen overflow-x-hidden">
        <Header />
        <main id="main-content">
          <Routes>
            <Route path="/" element={<RadarPick />} />
            <Route path="/browse" element={<Database />} />
            <Route path="/radar-pick" element={<Navigate to="/" replace />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/game/:appid" element={<Autopsy />} />
            <Route path="/developers/:name" element={<Developer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
