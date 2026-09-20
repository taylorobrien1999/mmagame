import { NavLink, Outlet } from "react-router-dom";

const OWN_PROMOTION_LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/roster", label: "Roster" },
  { to: "/events", label: "Events" },
  { to: "/negotiations", label: "Negotiations" },
  { to: "/promotion", label: "Promotion" },
];

const LEAGUE_LINKS = [
  { to: "/league", label: "League" },
  { to: "/league/free-agents", label: "Free agents" },
];

/**
 * The nav is split into two sections on purpose: "your promotion" (full
 * read/write, enforced by RLS in schema-v2.sql) and "league" (read-only —
 * spectating other promotions' events and browsing the shared free agent
 * pool). This mirrors the actual data boundary rather than hiding it.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen bg-ink">
      <nav className="flex w-56 shrink-0 flex-col border-r border-hairline bg-surface" aria-label="Main">
        <div className="border-b border-hairline px-5 py-5">
          <p className="font-display text-xl font-bold tracking-tightest text-text">Apex Ledger</p>
          <p className="text-xs text-text-faint">Fight Promotion Manager</p>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <NavGroup label="Your promotion" links={OWN_PROMOTION_LINKS} />
          <NavGroup label="League" links={LEAGUE_LINKS} />
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavGroup({ label, links }: { label: string; links: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="mb-6 px-3">
      <p className="mb-2 px-2 text-xs font-medium text-text-faint">{label}</p>
      <ul className="space-y-0.5">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block rounded-sm px-2 py-1.5 text-sm ${
                  isActive
                    ? "bg-surface-raised text-text"
                    : "text-text-muted hover:bg-surface-raised hover:text-text"
                }`
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
