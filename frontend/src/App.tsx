import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Header from "./components/Header";
import Database from "./pages/Database";
import RadarPick from "./pages/radar/SignalFire";
import Autopsy from "./pages/game/ConceptA";
import Trends from "./pages/Trends";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen overflow-x-hidden">
        <Header />
        <Routes>
          <Route path="/" element={<Database />} />
          <Route path="/radar-pick" element={<RadarPick />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/game/:appid" element={<Autopsy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <SpeedInsights />
    </BrowserRouter>
  );
}
