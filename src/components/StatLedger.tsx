interface StatItem {
  label: string;
  value: string;
  /** Only for values that genuinely moved — omit rather than force a sign. */
  delta?: { direction: "up" | "down"; text: string };
  tone?: "default" | "prestige";
}

/**
 * Deliberately NOT a grid of rounded cards with identical shadows — that's
 * the most common tell of a templated dashboard (see tokens.md). A ledger
 * divided by hairlines reads as considered and keeps the numbers, not the
 * container, as the visual subject.
 */
export function StatLedger({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-hairline border border-hairline sm:grid-cols-4 sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4">
          <dt className="text-sm text-text-muted">{item.label}</dt>
          <dd
            className={`font-display text-stat-lg tabular-nums tracking-tightest ${
              item.tone === "prestige" ? "text-prestige" : "text-text"
            }`}
          >
            {item.value}
          </dd>
          {item.delta && (
            <p
              className={`mt-1 text-xs ${item.delta.direction === "up" ? "text-win" : "text-signal"}`}
            >
              {item.delta.direction === "up" ? "↑" : "↓"} {item.delta.text}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}
