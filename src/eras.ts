import { SetInfo } from './api';

/** Eras shown on the Browse page, newest first. `series` are the catalog's own series names. */
export const ERAS: { id: string; name: string; series: string[] }[] = [
  { id: 'me', name: 'Mega Evolution', series: ['Mega Evolution'] },
  { id: 'sv', name: 'Scarlet & Violet', series: ['Scarlet & Violet'] },
  { id: 'swsh', name: 'Sword & Shield', series: ['Sword & Shield'] },
  { id: 'sm', name: 'Sun & Moon', series: ['Sun & Moon'] },
  { id: 'xy', name: 'XY', series: ['XY'] },
  { id: 'bw', name: 'Black & White', series: ['Black & White'] },
  { id: 'hgss', name: 'HeartGold & SoulSilver', series: ['HeartGold & SoulSilver', 'Call of Legends'] },
  { id: 'dp', name: 'Diamond & Pearl / Platinum', series: ['Diamond & Pearl', 'Platinum'] },
  { id: 'ex', name: 'EX', series: ['EX'] },
  { id: 'wotc', name: 'Wizards of the Coast', series: ['Base', 'Gym', 'Neo', 'E-Card'] },
  { id: 'other', name: 'Promos & Other', series: ['POP', 'NP', 'Other'] },
];

export type EraGroup = { id: string; name: string; sets: SetInfo[] };

/** Puts every set into an era. A series the list above does not know goes to "Promos & Other". */
export function groupByEra(sets: SetInfo[]): EraGroup[] {
  const known = new Map<string, string>();
  ERAS.forEach((e) => e.series.forEach((s) => known.set(s.toLowerCase(), e.id)));
  const buckets = new Map<string, SetInfo[]>();
  sets.forEach((s) => {
    const id = known.get((s.series ?? '').toLowerCase()) ?? 'other';
    buckets.set(id, [...(buckets.get(id) ?? []), s]);
  });
  return ERAS.map((e) => ({
    id: e.id,
    name: e.name,
    sets: (buckets.get(e.id) ?? []).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
  })).filter((g) => g.sets.length > 0);
}
