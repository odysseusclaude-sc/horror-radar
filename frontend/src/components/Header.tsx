import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { label: "Database", path: "/", disabled: false },
  { label: "Radar Pick", path: "/radar-pick", disabled: false },
  { label: "Trends", path: "/trends", disabled: false },
];

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background-dark border-b border-border-dark shadow-lg">
      <div className="px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-8">
          <Link to="/" className="flex items-center gap-2 md:gap-3">
            <div className="size-7 md:size-8 text-primary drop-shadow-[0_0_8px_rgba(192,57,43,0.5)]">
              <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <h1 className="text-base md:text-xl font-black tracking-tighter uppercase italic text-text-main">
              Horror Radar
            </h1>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              if (item.disabled) {
                return (
                  <span
                    key={item.label}
                    className="text-sm font-semibold text-text-dim/40 cursor-not-allowed select-none"
                    title="Coming soon"
                  >
                    {item.label}
                  </span>
                );
              }
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
        <div className="flex items-center gap-3">
          <div className="hidden md:block w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-orange-900 border border-white/10 shadow-inner" />
          {/* Hamburger */}
          <button
            className="md:hidden p-1.5 rounded hover:bg-surface-dark transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-text-main" style={{ fontSize: 24 }}>
              {mobileOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border-dark bg-surface-dark px-4 py-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            if (item.disabled) {
              return (
                <span
                  key={item.label}
                  className="px-3 py-2.5 text-sm font-semibold text-text-dim/40 select-none"
                >
                  {item.label}
                </span>
              );
            }
            const active =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2.5 rounded text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-text-dim hover:text-primary hover:bg-background-dark"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
