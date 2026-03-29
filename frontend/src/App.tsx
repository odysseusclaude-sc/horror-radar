import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Database from "./pages/Database";
import Insights from "./pages/insights/ConceptB";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <Header />
        <Routes>
          <Route path="/" element={<Database />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
