import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, mono, radius } from '../theme';
import { Btn, Chip, Loading, Panel, Screen, PageHead } from '../ui';
import { Card } from '../types';
import { formatDate, formatMoney, marketPrice } from '../api';
import { useStore } from '../store';

export function CardTile({ card, onPress }: { card: Card; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: '31.5%' }}>
      <Image source={{ uri: card.images.small }} style={{ aspectRatio: 0.716, borderRadius: 10 }} />
    </Pressable>
  );
}

export function CardRow({
  card,
  index,
  onPress,
  right,
}: {
  card: Card;
  index?: number;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={r.row}>
      {index != null ? <Text style={r.idx}>{index}</Text> : null}
      <Image source={{ uri: card.images.small }} style={r.img} />
      <View style={{ flex: 1 }}>
        <Text style={r.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={r.sub} numberOfLines={1}>
          {card.set.name} · #{card.number}
          {card.tcgplayer?.updatedAt ? ` · updated ${formatDate(card.tcgplayer.updatedAt)}` : ''}
        </Text>
      </View>
      <Text style={r.price}>{formatMoney(marketPrice(card))}</Text>
      {right}
    </Pressable>
  );
}

export default function CardDetail({ route }: any) {
  const card: Card = route.params.card;
  const { addOwned, addAlert } = useStore();
  const price = marketPrice(card);
  const [target, setTarget] = useState('');
  const [cost, setCost] = useState('');
  const [mode, setMode] = useState<'raw' | 'graded'>('raw');

  return (
    <Screen>
      <PageHead eyebrow={`${card.set.name} · #${card.number}`} title={card.name} />
      <Image
        source={{ uri: card.images.large }}
        style={{ width: '100%', aspectRatio: 0.716, borderRadius: 16 }}
        resizeMode="contain"
      />
      <Panel>
        <Text style={r.label}>STORED MARKET ESTIMATE</Text>
        <Text style={[r.big]}>{formatMoney(price)}</Text>
        <Text style={r.sub}>
          {price == null
            ? 'No stored price for this card — alerts stay unverified.'
            : `TCGplayer via pokemontcg.io · ${formatDate(card.tcgplayer?.updatedAt)}. An estimate is not a sale.`}
        </Text>
      </Panel>
      <Panel style={{ gap: 12 }}>
        <Text style={r.label}>ADD TO COLLECTION</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Chip label="Raw" active={mode === 'raw'} onPress={() => setMode('raw')} />
          <Chip label="Graded" active={mode === 'graded'} onPress={() => setMode('graded')} />
        </View>
        <TextInput
          value={cost}
          onChangeText={setCost}
          keyboardType="decimal-pad"
          placeholder="What you paid ($)"
          placeholderTextColor={colors.muted}
          style={r.input}
        />
        <Btn
          kind="gold"
          label="Add to my cards"
          icon="add"
          onPress={() => {
            addOwned({ card, graded: mode === 'graded', cost: parseFloat(cost) || 0, qty: 1 });
            Alert.alert('Added', `${card.name} is in your collection.`);
          }}
        />
      </Panel>
      <Panel style={{ gap: 12 }}>
        <Text style={r.label}>PRICE ALERT</Text>
        <TextInput
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
          placeholder="Target price ($)"
          placeholderTextColor={colors.muted}
          style={r.input}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn
            label="Alert if below"
            onPress={() => target && addAlert(card, parseFloat(target), 'below')}
          />
          <Btn
            label="Alert if above"
            onPress={() => target && addAlert(card, parseFloat(target), 'above')}
          />
        </View>
      </Panel>
    </Screen>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  idx: { color: colors.muted, width: 18, fontSize: 16 },
  img: { width: 56, height: 78, borderRadius: 6 },
  name: { color: colors.text, fontSize: 19, fontWeight: '500' },
  sub: { color: colors.muted, fontSize: 14, fontFamily: mono, marginTop: 4 },
  price: { color: colors.text, fontFamily: mono, fontWeight: '700', fontSize: 16 },
  label: { color: colors.muted, fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  big: { color: colors.text, fontSize: 36, fontFamily: mono, fontWeight: '700', marginVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
});
