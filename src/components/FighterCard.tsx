import type { RosterFighter } from "../design/types";

export function FighterCard({ fighter }: { fighter: RosterFighter }) {
  const recordStr = `${fighter.record.w}-${fighter.record.l}${fighter.record.d ? `-${fighter.record.d}` : ""}`;

  return (
    <article className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-b-0 hover:bg-surface-raised">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
        {fighter.imageUrl ? (
          <img src={fighter.imageUrl} alt={`${fighter.name} headshot`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-lg text-text-faint" aria-hidden="true">
            {fighter.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold leading-tight text-text">
          {fighter.name}
          {fighter.nickname && <span className="ml-2 font-body text-sm font-normal text-text-muted">"{fighter.nickname}"</span>}
        </p>
        <p className="text-sm text-text-muted">
          {fighter.weightClass} · <span className="tabular-nums">{recordStr}</span>
        </p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="font-display text-stat-md tabular-nums text-text">{fighter.overall}</p>
        <p className="text-xs text-text-faint">OVR</p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-sm ${fighter.contractFightsRemaining <= 1 ? "text-signal" : "text-text-muted"}`}>
          {fighter.contractFightsRemaining} fight{fighter.contractFightsRemaining === 1 ? "" : "s"} left
        </p>
      </div>
    </article>
  );
}

export function FighterCardSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-b-0" aria-hidden="true">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-sm bg-surface-raised" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-surface-raised" />
        <div className="h-3 w-1/4 animate-pulse rounded-sm bg-surface-raised" />
      </div>
    </div>
  );
}
