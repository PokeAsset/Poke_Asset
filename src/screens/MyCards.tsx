import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, mono, radius } from '../theme';
import { Btn, Empty, PageHead, Panel, Screen, SearchBox, Segmented } from '../ui';
import { formatMoney, marketPrice } from '../api';
import { useStore } from '../store';
import { CardRow } from './CardDetail';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel style={{ width: '48.5%', borderRadius: 24, minHeight: 150, padding: 20 }}>
      <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 38, fontFamily: mono, fontWeight: '800', marginTop: 12 }}>
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 16, marginTop: 8 }}>{sub}</Text> : null}
    </Panel>
  );
}

export default function MyCards() {
  const nav = useNavigation<any>();
  const { owned, removeOwned } = useStore();
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('All');

  const copies = owned.reduce((n, e) => n + e.qty, 0);
  const graded = owned.filter((e) => e.graded).reduce((n, e) => n + e.qty, 0);
  const cost = owned.reduce((n, e) => n + e.cost * e.qty, 0);
  const declared = owned.filter((e) => e.declaredValue != null);
  const declaredTotal = declared.reduce((n, e) => n + (e.declaredValue ?? 0) * e.qty, 0);

  const shown = owned
    .filter((e) => seg === 'All' || (seg === 'Graded') === e.graded)
    .filter((e) => !q.trim() || e.card.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen>
      <PageHead
        eyebrow="My collection"
        title="My cards"
        text="Every copy you have recorded — raw and graded — in one place, with the grade, condition and cost you stored."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn label="Manage entries" icon="library-outline" onPress={() => setSeg('All')} />
        <Btn kind="gold" label="Add cards" onPress={() => nav.navigate('CardDatabase')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="COPIES OWNED" value={String(copies)} />
        <Stat label="GRADED COPIES" value={String(graded)} sub="PSA, CGC, BGS, SGC" />
        <Stat label="RECORDED COST" value={formatMoney(cost)} />
        <Stat
          label="YOUR DECLARED VALUE"
          value={declared.length ? formatMoney(declaredTotal) : '—'}
          sub="your own entries"
        />
      </View>
      <SearchBox value={q} onChangeText={setQ} placeholder="Search your cards" />
      <Segmented options={['All', 'Raw', 'Graded']} value={seg} onChange={setSeg} />
      {shown.length === 0 ? (
        <Empty icon="albums-outline" text="Nothing here yet. Add cards from the catalog." />
      ) : (
        <Panel>
          {shown.map((e) => (
            <CardRow
              key={e.key}
              card={e.card}
              onPress={() => nav.navigate('CardDetail', { card: e.card })}
              right={
                <Pressable onPress={() => removeOwned(e.key)}>
                  <Ionicons name="trash-outline" size={20} color={colors.muted} />
                </Pressable>
              }
            />
          ))}
        </Panel>
      )}
    </Screen>
  );
}
