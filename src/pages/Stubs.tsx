/**
 * These are real empty states, not "coming soon" placeholders — per the
 * design principle, emptiness is an invitation to act, not a mood. Replace
 * the body of each with the real screen as phase 2 builds it out; keep the
 * page-level heading pattern (title + one-line orientation) consistent.
 */

function PageShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

export function Roster() {
  return (
    <PageShell title="Roster" subtitle="Every fighter under contract with your promotion.">
      <EmptyState message="No fighters signed yet." action="Sign a free agent to get started." />
    </PageShell>
  );
}

export function Events() {
  return (
    <PageShell title="Events" subtitle="Book venues, build fight cards, and run shows.">
      <EmptyState message="No events booked." action="Request a venue to schedule your first card." />
    </PageShell>
  );
}

export function Negotiations() {
  return (
    <PageShell title="Negotiations" subtitle="Contract offers and bout proposals awaiting a response.">
      <EmptyState message="Nothing pending." action="Offers you send will show up here until a fighter responds." />
    </PageShell>
  );
}

export function Promotion() {
  return (
    <PageShell title="Promotion settings" subtitle="Branding, divisions, titles, and bonus defaults.">
      <EmptyState message="Default settings are in effect." action="Customize your promotion's identity and rules." />
    </PageShell>
  );
}

export function League() {
  return (
    <PageShell title="League" subtitle="Watch events from every promotion in the world — read-only.">
      <EmptyState message="No events scheduled across the league right now." action="Check back once shows are booked." />
    </PageShell>
  );
}

export function FreeAgents() {
  return (
    <PageShell title="Free agents" subtitle="Unsigned fighters available to any promotion in the world.">
      <EmptyState message="The free agent pool is empty." action="Import fighter data to populate the world." />
    </PageShell>
  );
}

function EmptyState({ message, action }: { message: string; action: string }) {
  return (
    <div className="border border-dashed border-hairline px-6 py-16 text-center">
      <p className="font-display text-xl text-text-muted">{message}</p>
      <p className="mt-1 text-sm text-text-faint">{action}</p>
    </div>
  );
}
