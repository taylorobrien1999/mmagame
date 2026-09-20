import type { WorldClock } from "../design/types";

/**
 * Always visible. This is the async co-op mechanic made legible: both
 * players' ready-up state, the in-game date, and how far out the next
 * event sits. Nothing here is decorative — every element answers
 * "where are we in the world right now."
 */
export function WorldClockBar({ clock }: { clock: WorldClock }) {
  const formattedDate = new Date(clock.inGameDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline bg-surface px-6 py-3">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-lg font-semibold tracking-tightest text-text">
          {formattedDate}
        </span>
        {clock.nextEventName && (
          <span className="text-sm text-text-muted">
            Next: <span className="text-text">{clock.nextEventName}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4" role="status" aria-label="Co-op readiness">
        <ReadyIndicator label="You" ready={clock.playerReady} />
        <ReadyIndicator label={clock.opponentName} ready={clock.opponentReady} />
      </div>
    </div>
  );
}

function ReadyIndicator({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${ready ? "bg-win" : "bg-text-faint"}`}
        aria-hidden="true"
      />
      <span className="text-text-muted">{label}</span>
      <span className={ready ? "text-win" : "text-text-faint"}>
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}
