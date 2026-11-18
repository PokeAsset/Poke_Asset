import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Empty, Loading, PageHead, Panel, Screen, Segmented, Select } from '../ui';
import { formatDate, formatMoney, rankedCards, RankedCard } from '../api';
import { ERAS } from '../eras';

const ALL_ERAS = 'All eras';
const ERA_NAMES = [ALL_ERAS, ...ERAS.map((e) => e.name)];
const RARITIES = [
  'All rarities',
  'Rare Holo',
  'Rare Holo GX',
  'Rare Holo EX',
  'Rare Holo V',
  'Rare Holo VMAX',
  'Rare Holo VSTAR',
  'Rare Ultra',
  'Rare Secret',
  'Rare Rainbow',
  'Illustration Rare',
  'Special Illustration Rare',
  'Hyper Rare',
  'Double Rare',
  'Ultra Rare',
  'Promo',
];
const SORTS = ['Highest first', 'Lowest first'];

/** Menu → Price research. Raw (ungraded) market estimates ranked from the live catalog. */
export default function Market() {
  const nav = useNavigation<any>();
  const [era, setEra] = useState(ALL_ERAS);
  const [rarity, setRarity] = useState(RARITIES[0]);
  const [sort, setSort] = useState(SORTS[0]);
  const [rows, setRows] = useState<RankedCard[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError('');
    const series = era === ALL_ERAS ? undefined : ERAS.find((e) => e.name === era)?.series;
    rankedCards(series, rarity === RARITIES[0] ? undefined : rarity, 60)
      .then((r) => live && setRows(r))
      .catch((e) => {
        if (!live) return;
        setRows([]);
        setError(e?.message ?? 'Could not load prices.');
      })
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [era, rarity, tick]);

  const shown = sort === SORTS[0] ? rows : [...rows].reverse();

  return (
    <Screen>
      <PageHead
        eyebrow="Market research"
        title="Price research"
        text="Cards ranked by raw (ungraded) market estimate, read live from the card catalog. Each price shows its source and date. An estimate is not a sale."
      />
      <Select value={era} options={ERA_NAMES} onChange={setEra} />
      <Select value={rarity} options={RARITIES} onChange={setRarity} />
      <Segmented options={SORTS} value={sort} onChange={setSort} />
      <Panel style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Highest raw market estimates</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>
          Source: TCGplayer market price, reported through pokemontcg.io. Cards with no market price are not ranked. Prices are never blended across sources.
        </Text>
        {busy ? <Loading /> : null}
        {error ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text>
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn label="Try again" icon="refresh-outline" onPress={() => setTick((t) => t + 1)} />
            </View>
          </View>
        ) : null}
        {!busy && !error && shown.length === 0 ? <Empty icon="trending-up-outline" text="No cards with a verified market price match these filters." /> : null}
        {shown.map((r, i) => (
          <Pressable
            key={r.card.id}
            onPress={() => nav.navigate('CardDetail', { card: r.card })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
          >
            <Text style={{ color: colors.muted, width: 26, textAlign: 'right' }}>{sort === SORTS[0] ? i + 1 : shown.length - i}</Text>
            <Image source={{ uri: r.card.images.small }} style={{ width: 52, aspectRatio: 0.716, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                {r.card.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
                {r.card.set.name} · #{r.card.number}
                {r.card.rarity ? ` · ${r.card.rarity}` : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {r.variant} · TCGplayer via pokemontcg.io{r.updatedAt ? ` · ${formatDate(r.updatedAt)}` : ''}
              </Text>
            </View>
            <View style={{ borderRadius: radius.sm }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{formatMoney(r.price)}</Text>
            </View>
          </Pressable>
        ))}
      </Panel>
    </Screen>
  );
}
