export type PriceBlock = {
  market?: number | null;
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  directLow?: number | null;
};

export type CardSet = {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
};

export type Card = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: CardSet;
  images: { small: string; large: string };
  tcgplayer?: { updatedAt?: string; url?: string; prices?: Record<string, PriceBlock> };
};

export type Condition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

export type GradeCompany = 'PSA' | 'CGC' | 'BGS' | 'SGC';

export type OwnedEntry = {
  key: string;
  card: Card;
  /** number of copies in this entry */
  qty: number;
  /** what you paid per copy */
  cost: number;
  graded: boolean;
  company?: GradeCompany;
  grade?: string;
  condition?: Condition;
  /** YYYY-MM-DD */
  boughtOn?: string;
  notes?: string;
  /** your own value per copy; overrides the market estimate when set */
  declaredValue?: number;
  /** which printing: a TCGplayer price key such as holofoil, normal, reverseHolofoil, 1stEditionHolofoil */
  variant?: string;
};

export type WishlistEntry = {
  key: string;
  card: Card;
  target?: number;
  addedOn: string;
};

export type AlertEntry = {
  key: string;
  card: Card;
  target: number;
  direction: 'below' | 'above';
  createdOn?: string;
};

export type Snapshot = { date: string; value: number; cost: number };

export type Listing = {
  key: string;
  title: string;
  price: number;
  kind: 'Cards' | 'Sealed';
  tag?: 'PSA' | 'CGC' | 'Beckett (BGS)';
  saved: boolean;
  mine: boolean;
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; error?: boolean };

export type SeriesPoint = { date: string; price: number };

/** Graded prices and history from the price service, kept per card. */
export type GradedInfo = {
  fetchedAt: string;
  /** e.g. "PSA 10" -> { price, sales } */
  values: Record<string, { price: number; sales: number | null }>;
  rawHistory: SeriesPoint[] | null;
  gradedHistory: Record<string, SeriesPoint[]>;
  tcgPlayerId?: string | number | null;
};

/** One reading saved on the device each time a price is refreshed. */
export type HistoryPoint = { date: string; raw: number | null; graded: Record<string, number> };

/** A sealed product you own (booster box, ETB, tin...). */
export type SealedEntry = {
  key: string;
  /** product id from the price service, when known */
  productId?: string | number | null;
  name: string;
  setName?: string | null;
  type?: string | null;
  qty: number;
  /** what you paid per item */
  cost: number;
  /** last stored market price per item, null when unknown */
  market: number | null;
  updatedAt?: string | null;
  addedOn: string;
};

/** A sale you recorded. Prices are per item. */
export type SaleEntry = {
  key: string;
  kind: 'card' | 'sealed';
  name: string;
  setName?: string | null;
  qty: number;
  price: number;
  cost: number;
  date: string;
};
