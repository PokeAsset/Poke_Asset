import React, { useMemo, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { colors, radius } from './theme';
import { Ionicons } from '@expo/vector-icons';
import { Empty, Panel, Select } from './ui';
import { formatDate, formatMoney } from './api';
import { SealedItem, tcgplayerUrl } from './server';
import { useStore } from './store';
import { PriceChart } from './charts';

/** Product groups, in the order they are shown. The first pattern that matches a product's name wins. */
const KINDS: { label: string; test: RegExp }[] = [
  { label: 'Booster boxes', test: /booster box|booster display|display box/i },
  { label: 'Elite Trainer Boxes', test: /elite trainer|\betb\b/i },
  { label: 'Booster bundles', test: /booster bundle/i },
  { label: 'Build & Battle', test: /build\s*&?\s*battle/i },
  { label: 'Collections & premium boxes', test: /collection|premium|gift|trove|chest|stadium|binder|box/i },
  { label: 'Tins', test: /\btin\b/i },
  { label: 'Blisters & packs', test: /blister|booster pack|pack|sleeved/i },
  { label: 'Decks', test: /deck|league battle/i },
];

export const kindOf = (p: SealedItem): string => KINDS.find((k) => k.test.test(p.name))?.label ?? 'Other sealed';
const ORDER = [...KINDS.map((k) => k.label), 'Other sealed'];

function open(url: string) {
  Linking.openURL(url).catch(() => {});
}

/** Product photo; shows a plain box if there is no photo or it does not load. */
function ProductPhoto({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  const box = { width: 84, height: 84, borderRadius: 10, backgroundColor: colors.tintSlot, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  if (!uri || failed) {
    return (
      <View style={box}>
        <Ionicons name="cube-outline" size={30} color={colors.muted} />
      </View>
    );
  }
  return (
    <View style={box}>
      <Image source={{ uri }} style={{ width: 84, height: 84 }} resizeMode="contain" onError={() => setFailed(true)} />
    </View>
  );
}

const SORTS = ['Price: high to low', 'Price: low to high', 'Name A–Z'];

const Small = ({ text, on, onPress }: { text: string; on?: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{
      borderWidth: 1,
      borderColor: on ? colors.tintGoldBorder : colors.border,
      backgroundColor: on ? colors.tintGold : colors.card,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
    }}
  >
    <Text style={{ color: on ? colors.gold : colors.text, fontWeight: '700', fontSize: 13 }}>{text}</Text>
  </Pressable>
);

/**
 * Sealed products grouped by kind. Prices come from the price service; when a product has no price the
 * row says so and links to TCGplayer to check by hand, instead of showing a guess.
 */
export function SealedProducts({ items, setName, empty }: { items: SealedItem[]; setName?: string; empty?: string }) {
  const { sealed, addSealed } = useStore();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState(SORTS[0]);

  const groups = useMemo(() => {
    const m = new Map<string, SealedItem[]>();
    items.forEach((p) => {
      const k = kindOf(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    return ORDER.filter((k) => m.has(k)).map((k) => ({
      label: k,
      items: (m.get(k) ?? []).sort((a, b) => {
        if (sort === 'Name A–Z') return a.name.localeCompare(b.name);
        if (a.market == null && b.market == null) return 0;
        if (a.market == null) return 1; // no price goes last
        if (b.market == null) return -1;
        return sort === 'Price: low to high' ? a.market - b.market : b.market - a.market;
      }),
    }));
  }, [items, sort]);

  const owned = (p: SealedItem) =>
    sealed.filter((s) => (p.id != null && s.productId === p.id) || (p.id == null && s.name === p.name)).reduce((n, s) => n + s.qty, 0);

  const add = (p: SealedItem) => {
    addSealed({ productId: p.id, name: p.name, setName: p.setName ?? setName, type: p.type, qty: 1, cost: 0, market: p.market, updatedAt: p.updatedAt });
    setNotice(`Added ${p.name}. Open Collection to set what you paid.`);
  };

  if (items.length === 0) {
    return (
      <Panel>
        <Empty icon="cube-outline" text={empty ?? 'No sealed products found.'} />
      </Panel>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {notice ? <Text style={{ color: colors.amber }}>{notice}</Text> : null}
      <View style={{ maxWidth: 260 }}>
        <Select value={sort} options={SORTS} onChange={setSort} />
      </View>
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
            {g.label} <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '600' }}>({g.items.length})</Text>
          </Text>
          <Panel style={{ gap: 14 }}>
            {g.items.map((p, i) => {
              const key = `${g.label}-${p.id ?? p.name}-${i}`;
              const n = owned(p);
              return (
                <View key={key} style={{ flexDirection: 'row', gap: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <ProductPhoto uri={p.imageUrl} />
                  <View style={{ flex: 1, gap: 6 }}>
                  <Pressable onPress={() => setOpenKey(openKey === key ? null : key)}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                  </Pressable>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {[p.setName, p.type, p.variant].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>MARKET PRICE</Text>
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{p.market != null ? formatMoney(p.market) : 'No price on file'}</Text>
                    </View>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>LOWEST LISTING</Text>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>{p.low != null ? formatMoney(p.low) : '—'}</Text>
                    </View>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>HISTORY</Text>
                      <Text style={{ color: p.history && p.history.length > 1 ? colors.amber : colors.muted, fontWeight: '700', fontSize: 14, paddingTop: 3 }}>
                        {p.history && p.history.length > 1 ? `${p.history.length} readings (tap name)` : 'none recorded'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {p.market != null || p.low != null
                      ? `Source: ${p.source ?? 'price service'}${p.updatedAt ? ` · price dated ${formatDate(p.updatedAt)}` : ' · no price date given'}`
                      : 'No source has a price for this product.'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <Small text={n > 0 ? `+ Add (${n} owned)` : '+ Add'} on={n > 0} onPress={() => add(p)} />
                    <Small text="Check on TCGplayer" onPress={() => open(tcgplayerUrl(p.name))} />
                  </View>
                  {openKey === key ? (
                    <View style={{ marginTop: 6 }}>
                      <PriceChart series={[{ label: 'Market', points: p.history ?? [] }]} note="No price history for this product." />
                    </View>
                  ) : null}
                  </View>
                </View>
              );
            })}
          </Panel>
        </View>
      ))}
    </View>
  );
}
