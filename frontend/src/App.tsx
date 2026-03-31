import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Database from "./pages/Database";
import RadarPick from "./pages/radar/SignalFire";
import Autopsy from "./pages/game/ConceptA";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <Header />
        <Routes>
          <Route path="/" element={<Database />} />
          <Route path="/radar-pick" element={<RadarPick />} />
          <Route path="/game/:appid" element={<Autopsy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
