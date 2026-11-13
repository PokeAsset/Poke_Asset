import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, mono } from '../theme';
import { Empty, PageHead, Panel, Screen, SearchBox } from '../ui';
import { formatMoney, marketPrice } from '../api';
import { Card } from '../types';
import { useStore } from '../store';
import { CardRow } from './CardDetail';
import { useCardSearch } from './Home';

type Line = { key: string; card: Card };
const sum = (l: Line[]) => l.reduce((n, x) => n + (marketPrice(x.card) ?? 0), 0);

function Side({
  title,
  sub,
  border,
  lines,
  onRemove,
  searchSlot,
  total,
}: {
  title: string;
  sub: string;
  border: string;
  lines: Line[];
  onRemove: (k: string) => void;
  searchSlot: React.ReactNode;
  total: number;
}) {
  return (
    <Panel border={border} style={{ borderRadius: 28, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 17, marginTop: 4 }}>{sub}</Text>
        </View>
        <Text style={{ color: colors.text, fontFamily: mono, fontWeight: '700', fontSize: 26 }}>
          {formatMoney(total)}
        </Text>
      </View>
      {lines.length === 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.border,
            borderRadius: 22,
            paddingVertical: 36,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 18 }}>Nothing added yet.</Text>
        </View>
      ) : (
        lines.map((l) => (
          <CardRow
            key={l.key}
            card={l.card}
            right={
              <Pressable onPress={() => onRemove(l.key)}>
                <Ionicons name="close-circle-outline" size={24} color={colors.muted} />
              </Pressable>
            }
          />
        ))
      )}
      {searchSlot}
    </Panel>
  );
}

export default function Trade() {
  const { owned } = useStore();
  const [give, setGive] = useState<Line[]>([]);
  const [receive, setReceive] = useState<Line[]>([]);
  const [ownQ, setOwnQ] = useState('');
  const catalog = useCardSearch();

  const ownMatches = owned.filter(
    (e) =>
      ownQ.trim() &&
      e.card.name.toLowerCase().includes(ownQ.toLowerCase()) &&
      !give.some((g) => g.key === e.key),
  );

  const giveTotal = sum(give);
  const recvTotal = sum(receive);
  const diff = recvTotal - giveTotal;
  const missing = [...give, ...receive].filter((l) => marketPrice(l.card) == null).length;

  return (
    <Screen>
      <PageHead
        eyebrow="Trade desk"
        title="Trade analyzer"
        text="Put what leaves and what arrives side by side. Values use each card's stored market estimate; nothing is rounded to make a trade look even."
      />
      <Side
        title="You give"
        sub="Pick from the cards you own"
        border="#5a2230"
        lines={give}
        total={giveTotal}
        onRemove={(k) => setGive((g) => g.filter((x) => x.key !== k))}
        searchSlot={
          <>
            <SearchBox value={ownQ} onChangeText={setOwnQ} placeholder="Search a card you own" />
            {owned.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 16, paddingHorizontal: 8 }}>
                Nothing in your collection yet.
              </Text>
            ) : null}
            {ownMatches.map((e) => (
              <CardRow
                key={e.key}
                card={e.card}
                onPress={() => {
                  setGive((g) => [...g, { key: e.key, card: e.card }]);
                  setOwnQ('');
                }}
              />
            ))}
          </>
        }
      />
      <Side
        title="You receive"
        sub="Search the full catalog"
        border="#134438"
        lines={receive}
        total={recvTotal}
        onRemove={(k) => setReceive((g) => g.filter((x) => x.key !== k))}
        searchSlot={
          <>
            <SearchBox
              value={catalog.text}
              onChangeText={catalog.setText}
              placeholder="Search the catalog for a card"
            />
            {catalog.results.slice(0, 6).map((c) => (
              <CardRow
                key={c.id}
                card={c}
                onPress={() => {
                  setReceive((g) => [...g, { key: c.id + Date.now(), card: c }]);
                  catalog.setText('');
                }}
              />
            ))}
          </>
        }
      />
      {give.length + receive.length > 0 ? (
        <Panel style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>
            DIFFERENCE
          </Text>
          <Text
            style={{
              fontFamily: mono,
              fontSize: 30,
              fontWeight: '700',
              color: diff === 0 ? colors.text : diff > 0 ? '#3ecf8e' : colors.red,
            }}
          >
            {diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 15 }}>
            {diff > 0 ? 'You receive more than you give.' : diff < 0 ? 'You give more than you receive.' : 'Both sides match.'}
            {missing ? ` ${missing} card(s) have no stored price and count as $0.00.` : ''}
          </Text>
        </Panel>
      ) : null}
    </Screen>
  );
}
