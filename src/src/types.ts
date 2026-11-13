export type PriceBlock = { market?: number | null; low?: number | null; high?: number | null };

export type Card = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: { id: string; name: string; series?: string };
  images: { small: string; large: string };
  tcgplayer?: { updatedAt?: string; prices?: Record<string, PriceBlock> };
};

export type OwnedEntry = {
  key: string;
  card: Card;
  graded: boolean;
  company?: 'PSA' | 'CGC' | 'BGS' | 'SGC';
  grade?: string;
  condition?: string;
  cost: number;
  declaredValue?: number;
  qty: number;
};

export type AlertEntry = {
  key: string;
  card: Card;
  target: number;
  direction: 'below' | 'above';
};

export type Listing = {
  key: string;
  title: string;
  price: number;
  kind: 'Cards' | 'Sealed';
  tag?: 'PSA' | 'CGC' | 'Beckett (BGS)';
  saved: boolean;
  mine: boolean;
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; text
