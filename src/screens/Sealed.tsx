import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../theme';
import { Chip, Empty, Loading, PageHead, Panel, Screen, SearchBox } from '../ui';
import { formatDate, formatMoney } from '../api';
import { searchSealed, SealedItem } from '../server';
import { PriceChart } from '../charts';

const QUICK = ['Booster Box', 'Elite Trainer Box', 'Booster Bundle', 'Ultra Premium Collection', 'Tin', 'Build & Battle'];

/** Sealed products catalog, searched by name or set through the price service. */
export default function Sealed() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SealedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      setError('');
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setItems(await searchSealed(q.trim()));
        setError('');
      } catch (e: any) {
        setItems([]);
        setError(e?.message ?? 'Search failed');
      } finally {
        setBusy(false);
      }
    }, 450);
  }, [q]);

  return (
    <Screen>
      <PageHead
        eyebrow="Catalog"
        title="Sealed products"
        text="Booster boxes, Elite Trainer Boxes, bundles, tins and collections from every set. Search by product name or set."
      />
      <SearchBox value={q} onChangeText={setQ} placeholder="Search a set or product (e.g. Base Set, 151)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {QUICK.map((t) => (
          <Chip key={t} label={t} onPress={() => setQ(t)} />
        ))}
      </View>
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      <Panel style={{ gap: 14 }}>
        {items.length === 0 && !busy ? (
          <Empty icon="cube-outline" text="Search to see products and their market prices." />
        ) : (
          items.map((p, i) => {
            const key = `${p.id ?? p.name}-${i}`;
            return (
              <View key={key} style={{ gap: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 17 }} onPress={() => setOpen(open === key ? null : key)}>
                  {p.name}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {[p.setName, p.type].filter(Boolean).join(' · ')}
                  {p.updatedAt ? ` · updated ${formatDate(p.updatedAt)}` : ''}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  Market {formatMoney(p.market)}
                  {p.low != null ? ` · Low ${formatMoney(p.low)}` : ''}
                </Text>
                {open === key ? (
                  <View style={{ marginTop: 8 }}>
                    <PriceChart series={[{ label: 'Market', points: p.history ?? [] }]} note="No price history for this product." />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </Panel>
    </Screen>
  );
}
