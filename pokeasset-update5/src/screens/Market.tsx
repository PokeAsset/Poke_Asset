import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Loading, PageHead, Panel, Screen, Select } from '../ui';
import { topCards } from '../api';
import { Card } from '../types';
import { CardRow } from './CardDetail';

const ERAS = ['All eras', 'Scarlet & Violet', 'Sword & Shield', 'Sun & Moon', 'XY', 'Black & White', 'EX', 'Base'];
const RARITIES = [
  'All rarities',
  'Rare Holo',
  'Rare Holo GX',
  'Rare Holo EX',
  'Rare Holo VMAX',
  'Rare Secret',
  'Rare Rainbow',
  'Illustration Rare',
  'Special Illustration Rare',
  'Promo',
];

export default function Market() {
  const nav = useNavigation<any>();
  const [era, setEra] = useState(ERAS[0]);
  const [rarity, setRarity] = useState(RARITIES[0]);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setBusy(true);
    topCards(era === ERAS[0] ? undefined : era, rarity === RARITIES[0] ? undefined : rarity)
      .then((c) => {
        setCards(c);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [era, rarity]);

  return (
    <Screen>
      <PageHead
        eyebrow="Market research"
        title="Price research"
        text="Rankings built from the pricing records stored in PokéAsset. Estimates are labelled with their source and never blended across providers."
      />
      <Select value={era} options={ERAS} onChange={setEra} />
      <Select value={rarity} options={RARITIES} onChange={setRarity} />
      <Panel>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
          Highest raw market estimates
        </Text>
        <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 23, marginVertical: 10 }}>
          TCGplayer market estimate reported through pokemontcg.io. An estimate is not a sale.
        </Text>
        {busy ? <Loading /> : null}
        {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
        {cards.map((c, i) => (
          <CardRow key={c.id} card={c} index={i + 1} onPress={() => nav.navigate('CardDetail', { card: c })} />
        ))}
      </Panel>
    </Screen>
  );
}
