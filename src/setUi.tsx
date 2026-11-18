import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { colors, radius } from './theme';
import { Empty, Loading, SearchBox } from './ui';
import { fetchEraArt, fetchSets, formatDate, formatMoney, SetArt, SetInfo } from './api';
import { EraGroup, ERAS, groupByEra } from './eras';
import { entryValue } from './portfolio';
import { useStore } from './store';

/* Shared pieces for the card-set pages and the sealed-product pages: era chips, set grid, set tiles. */

export type SetStat = { have: number; value: number; copies: number };
export type SealedStat = { items: number; value: number };

const nameKey = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Cards you own, counted per set: distinct cards, copies and value (your declared value, else market). */
export function useOwnedBySet(): Map<string, SetStat> {
  const { owned } = useStore();
  return useMemo(() => {
    const seen = new Map<string, Set<string>>();
    const out = new Map<string, SetStat>();
    owned.forEach((e) => {
      const id = e.card.set.id;
      const st = out.get(id) ?? { have: 0, value: 0, copies: 0 };
      const ids = seen.get(id) ?? new Set<string>();
      if (!ids.has(e.card.id)) {
        ids.add(e.card.id);
        st.have += 1;
      }
      seen.set(id, ids);
      st.copies += e.qty;
      st.value += (entryValue(e).perCopy ?? 0) * e.qty;
      out.set(id, st);
    });
    return out;
  }, [owned]);
}

/** Sealed products you own, counted per set name. */
export function useSealedBySet(): Map<string, SealedStat> {
  const { sealed } = useStore();
  return useMemo(() => {
    const out = new Map<string, SealedStat>();
    sealed.forEach((s) => {
      const k = nameKey(s.setName);
      if (!k) return;
      const st = out.get(k) ?? { items: 0, value: 0 };
      st.items += s.qty;
      st.value += (s.market ?? 0) * s.qty;
      out.set(k, st);
    });
    return out;
  }, [sealed]);
}
export const sealedStatFor = (m: Map<string, SealedStat>, set: SetInfo) => m.get(nameKey(set.name));

let setsCache: Promise<SetInfo[]> | null = null;
/** Every set, loaded once per visit. */
export function loadSets(): Promise<SetInfo[]> {
  if (!setsCache) {
    setsCache = fetchSets().catch((e) => {
      setsCache = null;
      throw e;
    });
  }
  return setsCache;
}

/* ---------- layout ---------- */

function useColumns() {
  const { width } = useWindowDimensions();
  return width >= 860 ? 4 : width >= 600 ? 3 : 2;
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>{children}</View>;
}

function Cell({ children }: { children: React.ReactNode }) {
  const cols = useColumns();
  return <View style={{ width: `${100 / cols}%` as `${number}%`, padding: 6 }}>{children}</View>;
}

/** A set's picture: a card from the set cropped behind its logo. */
export function Banner({ art, logo, height, name }: { art?: SetArt; logo?: string; height: number; name: string }) {
  return (
    <View style={{ height, overflow: 'hidden', borderRadius: radius.sm, backgroundColor: colors.tintBlue, alignItems: 'center', justifyContent: 'center' }}>
      {art ? (
        <Image
          source={{ uri: art.large }}
          style={{ position: 'absolute', top: -height * 0.18, left: 0, width: '100%', aspectRatio: 0.716 }}
          resizeMode="cover"
        />
      ) : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: art ? 'rgba(0,0,0,0.38)' : 'transparent' }} />
      {logo ? (
        <Image source={{ uri: logo }} style={{ width: '82%', height: height * 0.62 }} resizeMode="contain" />
      ) : (
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center', paddingHorizontal: 8 }}>{name}</Text>
      )}
    </View>
  );
}

const Pill = ({ text }: { text: string }) => (
  <View
    style={{
      alignSelf: 'flex-end',
      backgroundColor: colors.tintGold,
      borderColor: colors.tintGoldBorder,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 6,
    }}
  >
    <Text style={{ color: colors.gold, fontWeight: '700', fontSize: 13 }}>{text}</Text>
  </View>
);

/** One set. In "cards" mode it shows your progress and the value of what you own; in "sealed" mode, what sealed you own. */
export function SetTile({
  set,
  art,
  mode,
  stat,
  sealedStat,
  onPress,
}: {
  set: SetInfo;
  art?: SetArt;
  mode: 'cards' | 'sealed';
  stat?: SetStat;
  sealedStat?: SealedStat;
  onPress: () => void;
}) {
  const have = stat?.have ?? 0;
  const pct = set.total > 0 ? Math.min(100, Math.round((have / set.total) * 100)) : 0;
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10, gap: 8, flex: 1 }}
    >
      <Banner art={art} logo={set.images?.logo} height={96} name={set.name} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
          {set.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          {set.series} · {formatDate(set.releaseDate)}
        </Text>
      </View>
      {mode === 'cards' ? (
        <>
          <View>
            <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>YOUR VALUE</Text>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{(stat?.value ?? 0) > 0 ? formatMoney(stat!.value) : '—'}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>COLLECTION</Text>
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {have}/{set.total} ({pct}%)
              </Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.tintBlue, overflow: 'hidden' }}>
              <View style={{ height: 5, width: `${pct}%` as `${number}%`, backgroundColor: colors.amber }} />
            </View>
          </View>
          <Pill text={`${set.total} cards`} />
        </>
      ) : (
        <>
          <Text style={{ color: (sealedStat?.items ?? 0) > 0 ? colors.amber : colors.muted, fontSize: 13 }}>
            {sealedStat && sealedStat.items > 0
              ? `You own ${sealedStat.items}${sealedStat.value > 0 ? ` · ${formatMoney(sealedStat.value)}` : ''}`
              : 'Tap to see products'}
          </Text>
          <Pill text="Sealed products" />
        </>
      )}
    </Pressable>
  );
}

/* ---------- era chips and sections ---------- */

export function EraChips({ eras, active, onChange }: { eras: EraGroup[]; active: string; onChange: (id: string) => void }) {
  const list = [...eras.map((e) => ({ id: e.id, name: e.name })), { id: 'all', name: 'All eras' }];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {list.map((e) => {
        const on = active === e.id;
        return (
          <Pressable
            key={e.id}
            onPress={() => onChange(e.id)}
            style={{
              borderWidth: 1,
              borderRadius: radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderColor: on ? colors.tintGoldBorder : colors.border,
              backgroundColor: on ? colors.tintGold : 'transparent',
            }}
          >
            <Text style={{ color: on ? colors.gold : colors.text, fontWeight: '600' }}>{e.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function EraSection({ era, mode, onOpen }: { era: EraGroup; mode: 'cards' | 'sealed'; onOpen: (s: SetInfo) => void }) {
  const owned = useOwnedBySet();
  const sealed = useSealedBySet();
  const [art, setArt] = useState<Record<string, SetArt>>({});
  useEffect(() => {
    const series = ERAS.find((e) => e.id === era.id)?.series ?? [];
    let live = true;
    fetchEraArt(series).then((a) => live && setArt(a));
    return () => {
      live = false;
    };
  }, [era.id]);
  const first = era.sets[0];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {first?.images?.logo ? <Image source={{ uri: first.images.logo }} style={{ width: 120, height: 44 }} resizeMode="contain" /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{era.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{era.sets.length} sets</Text>
        </View>
      </View>
      <Grid>
        {era.sets.map((s) => (
          <Cell key={s.id}>
            <SetTile set={s} art={art[s.id]} mode={mode} stat={owned.get(s.id)} sealedStat={sealedStatFor(sealed, s)} onPress={() => onOpen(s)} />
          </Cell>
        ))}
      </Grid>
    </View>
  );
}

/**
 * Era chips + grids of sets (or a flat grid of matches when searching). Used by the card sets page
 * and the sealed products page. `query` filters by set name; `showSearch` adds its own search box.
 */
export function SetBrowser({
  mode,
  onOpen,
  query,
  showSearch,
}: {
  mode: 'cards' | 'sealed';
  onOpen: (s: SetInfo) => void;
  query?: string;
  showSearch?: boolean;
}) {
  const owned = useOwnedBySet();
  const sealed = useSealedBySet();
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState('');
  const [era, setEra] = useState('');

  useEffect(() => {
    loadSets()
      .then(setSets)
      .catch((e) => setError(e?.message ?? 'Could not load sets.'))
      .finally(() => setBusy(false));
  }, []);

  const eras = useMemo(() => groupByEra(sets), [sets]);
  const active = era || eras[0]?.id || '';
  const text = (showSearch ? own : query ?? '').trim().toLowerCase();
  const found = text
    ? sets.filter((s) => s.name.toLowerCase().includes(text) || (s.ptcgoCode ?? '').toLowerCase() === text)
    : [];

  return (
    <>
      {showSearch ? <SearchBox value={own} onChangeText={setOwn} placeholder="Find a set…" /> : null}
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
      {text ? (
        found.length === 0 ? (
          showSearch && !busy ? <Empty icon="search-outline" text="No set has that name." /> : null
        ) : (
          <Grid>
            {found.map((s) => (
              <Cell key={s.id}>
                <SetTile set={s} mode={mode} stat={owned.get(s.id)} sealedStat={sealedStatFor(sealed, s)} onPress={() => onOpen(s)} />
              </Cell>
            ))}
          </Grid>
        )
      ) : (
        <>
          <EraChips eras={eras} active={active} onChange={setEra} />
          {(active === 'all' ? eras : eras.filter((e) => e.id === active)).map((e) => (
            <EraSection key={e.id} era={e} mode={mode} onOpen={onOpen} />
          ))}
        </>
      )}
    </>
  );
}
