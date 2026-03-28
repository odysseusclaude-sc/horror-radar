import Header from "./components/Header";
import Database from "./pages/Database";

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <Database />
    </div>
  );
}
