import type { UpcomingEvent } from "../design/types";

/**
 * The fight-bill treatment: main event gets the display type and the
 * full-width row, undercard stacks smaller beneath it. This is the one
 * deliberate motion moment on the dashboard — a single entrance, not
 * per-card hover effects.
 */
export function EventMarquee({ event }: { event: UpcomingEvent }) {
  const main = event.bouts.find((b) => b.cardPosition === 1);
  const rest = event.bouts.filter((b) => b.cardPosition !== 1).sort((a, b) => a.cardPosition - b.cardPosition);
  const eventDate = new Date(event.eventDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <section
      className="motion-safe:animate-[fadeUp_0.5s_ease-out] rounded-sm border border-hairline bg-surface"
      aria-labelledby="marquee-event-name"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-6 py-4">
        <h2 id="marquee-event-name" className="font-display text-2xl font-bold tracking-tightest text-text">
          {event.name}
        </h2>
        <p className="text-sm text-text-muted">
          {eventDate} · {event.venue}, {event.city}
        </p>
      </div>

      {main && (
        <div className="border-b border-hairline px-6 py-8">
          {main.titleBout && (
            <p className="mb-2 text-sm font-medium text-prestige">Championship bout</p>
          )}
          <div className="flex items-center justify-between gap-4">
            <FighterBilling name={main.fighterA.name} record={main.fighterA.record} align="left" />
            <span className="font-display text-3xl font-semibold text-text-faint">vs</span>
            <FighterBilling name={main.fighterB.name} record={main.fighterB.record} align="right" />
          </div>
          <p className="mt-3 text-center text-sm text-text-muted">{main.weightClass}</p>
        </div>
      )}

      {rest.length > 0 && (
        <ul className="divide-y divide-hairline">
          {rest.map((bout) => (
            <li key={bout.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <span className="w-6 text-text-faint">{bout.cardPosition}</span>
              <span className="flex-1 text-right text-text">{bout.fighterA.name}</span>
              <span className="mx-4 text-text-faint">vs</span>
              <span className="flex-1 text-text">{bout.fighterB.name}</span>
              <span className="ml-4 w-28 text-right text-text-muted">{bout.weightClass}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FighterBilling({
  name, record, align,
}: { name: string; record: string; align: "left" | "right" }) {
  return (
    <div className={align === "left" ? "text-left" : "text-right"}>
      <p className="font-display text-stat-md text-text">{name}</p>
      <p className="text-sm tabular-nums text-text-muted">{record}</p>
    </div>
  );
}

export function EventMarqueeEmpty() {
  return (
    <section className="rounded-sm border border-dashed border-hairline p-10 text-center">
      <p className="font-display text-xl text-text-muted">No event booked yet</p>
      <p className="mt-1 text-sm text-text-faint">
        Book a card to see it here — request a venue, then build the fight order.
      </p>
    </section>
  );
}
