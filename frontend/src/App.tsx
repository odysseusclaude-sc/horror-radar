import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Database from "./pages/Database";
import Insights from "./pages/insights/ConceptB";
import Autopsy from "./pages/game/ConceptA";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <Header />
        <Routes>
          <Route path="/" element={<Database />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/game/:appid" element={<Autopsy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
