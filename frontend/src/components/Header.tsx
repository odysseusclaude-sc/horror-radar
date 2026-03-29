import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { label: "Database", path: "/" },
  { label: "Insights", path: "/insights" },
  { label: "Trends", path: "#" },
  { label: "Submit Game", path: "#" },
];

export default function Header() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-background-dark border-b border-border-dark px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="size-8 text-primary drop-shadow-[0_0_8px_rgba(192,57,43,0.5)]">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-xl font-black tracking-tighter uppercase italic text-text-main">
            Horror Radar
          </h1>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const active =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                className={
                  active
                    ? "text-sm font-bold text-primary border-b-2 border-primary pb-1"
                    : "text-sm font-semibold text-text-dim hover:text-primary transition-colors"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
            search
          </span>
          <input
            className="bg-surface-dark border border-border-dark rounded-lg pl-10 pr-4 py-1.5 text-sm w-64 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-text-main"
            placeholder="Search Steam ID or Title..."
            type="text"
          />
        </div>
        <button className="p-2 hover:bg-surface-dark rounded-full text-text-dim hover:text-text-main transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-orange-900 border border-white/10 shadow-inner" />
      </div>
    </header>
  );
}
