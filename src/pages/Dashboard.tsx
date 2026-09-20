import { Link } from "react-router-dom";
import { WorldClockBar } from "../components/WorldClockBar";
import { EventMarquee, EventMarqueeEmpty } from "../components/EventMarquee";
import { StatLedger } from "../components/StatLedger";
import { FighterCard } from "../components/FighterCard";
import type { WorldClock, UpcomingEvent, RosterFighter } from "../design/types";

// Placeholder data shaped exactly like what Supabase will return, so wiring
// the real queries later is a drop-in replacement for this block — not a
// rewrite of the screen.
const MOCK_CLOCK: WorldClock = {
  inGameDate: "2026-09-20",
  nextEventDate: "2026-10-04",
  nextEventName: "Apex 12: Vanguard vs Castellan",
  playerReady: true,
  opponentReady: false,
  opponentName: "Marcus (Titan FC)",
};

const MOCK_EVENT: UpcomingEvent = {
  id: "evt-1",
  name: "Apex 12: Vanguard vs Castellan",
  eventDate: "2026-10-04",
  venue: "The Armory",
  city: "Calgary, AB",
  bouts: [
    { id: "b1", cardPosition: 1, titleBout: true, weightClass: "Lightweight Title",
      fighterA: { name: "Alex Vanguard", record: "14-2-0" }, fighterB: { name: "Bruno Castellan", record: "13-3-0" } },
    { id: "b2", cardPosition: 2, titleBout: false, weightClass: "Welterweight",
      fighterA: { name: "Diego Reyes", record: "9-1-0" }, fighterB: { name: "Sam Okafor", record: "8-2-1" } },
    { id: "b3", cardPosition: 3, titleBout: false, weightClass: "Featherweight",
      fighterA: { name: "Jonas Kade", record: "6-0-0" }, fighterB: { name: "Petar Lukić", record: "7-3-0" } },
  ],
};

const MOCK_ROSTER: RosterFighter[] = [
  { id: "f1", name: "Alex Vanguard", record: { w: 14, l: 2, d: 0 }, weightClass: "Lightweight", overall: 83, popularity: 61, contractFightsRemaining: 2 },
  { id: "f2", name: "Diego Reyes", record: { w: 9, l: 1, d: 0 }, weightClass: "Welterweight", overall: 76, popularity: 34, contractFightsRemaining: 4 },
  { id: "f3", name: "Jonas Kade", record: { w: 6, l: 0, d: 0 }, weightClass: "Featherweight", overall: 71, popularity: 22, contractFightsRemaining: 1 },
];

export function Dashboard() {
  return (
    <div>
      <WorldClockBar clock={MOCK_CLOCK} />

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-sm text-text-muted">Apex Fighting</p>
            <h1 className="font-display text-3xl font-bold tracking-tightest text-text">Promotion overview</h1>
          </div>
        </header>

        <StatLedger
          items={[
            { label: "Treasury", value: "$284,500" },
            { label: "Prestige", value: "62", tone: "prestige", delta: { direction: "up", text: "+4 last event" } },
            { label: "Roster", value: String(MOCK_ROSTER.length) },
            { label: "Reputation", value: "78" },
          ]}
        />

        <section>
          <SectionHeader title="Next event" />
          {MOCK_EVENT ? <EventMarquee event={MOCK_EVENT} /> : <EventMarqueeEmpty />}
        </section>

        <section>
          <SectionHeader title="Roster" action={{ to: "/roster", label: "View all" }} />
          <div className="border border-hairline">
            {MOCK_ROSTER.map((f) => (
              <FighterCard key={f.id} fighter={f} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { to: string; label: string } }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-display text-xl font-semibold tracking-tightest text-text">{title}</h2>
      {action && (
        <Link to={action.to} className="text-sm text-text-muted hover:text-text">
          {action.label}
        </Link>
      )}
    </div>
  );
}
