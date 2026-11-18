import React, { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors, radius } from './theme';
import { Empty, Panel } from './ui';
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

  const groups = useMemo(() => {
    const m = new Map<string, SealedItem[]>();
    items.forEach((p) => {
      const k = kindOf(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    return ORDER.filter((k) => m.has(k)).map((k) => ({
      label: k,
      items: (m.get(k) ?? []).sort((a, b) => (b.market ?? -1) - (a.market ?? -1)),
    }));
  }, [items]);

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
                <View key={key} style={{ gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Pressable onPress={() => setOpenKey(openKey === key ? null : key)}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                  </Pressable>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {[p.setName, p.type, p.updatedAt ? `updated ${formatDate(p.updatedAt)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {p.market != null ? `Market ${formatMoney(p.market)}` : 'No price on file'}
                    {p.low != null ? ` · Low ${formatMoney(p.low)}` : ''}
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
              );
            })}
          </Panel>
        </View>
      ))}
    </View>
  );
}
