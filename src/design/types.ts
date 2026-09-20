/** UI-facing types. Deliberately a thin mirror of the DB schema — not a
 * 1:1 copy, since the UI only needs a subset of columns for any given view. */

export interface PromotionSummary {
  id: string;
  name: string;
  shortName: string;
  prestige: number;
  money: number;
  logoPath: string | null;
  brandColor: string;
  rosterSize: number;
}

export interface WorldClock {
  inGameDate: string; // ISO date
  nextEventDate: string | null;
  nextEventName: string | null;
  playerReady: boolean;
  opponentReady: boolean;
  opponentName: string;
}

export interface CardBout {
  id: string;
  cardPosition: number;
  titleBout: boolean;
  fighterA: { name: string; record: string; imageUrl?: string };
  fighterB: { name: string; record: string; imageUrl?: string };
  weightClass: string;
}

export interface UpcomingEvent {
  id: string;
  name: string;
  eventDate: string;
  venue: string;
  city: string;
  bouts: CardBout[];
}

export interface RosterFighter {
  id: string;
  name: string;
  nickname?: string;
  record: { w: number; l: number; d: number };
  weightClass: string;
  overall: number;
  popularity: number;
  imageUrl?: string;
  contractFightsRemaining: number;
}
