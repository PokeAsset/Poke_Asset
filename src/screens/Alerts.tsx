import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Chip, Empty, PageHead, Panel, Screen } from '../ui';
import { formatMoney, marketPrice } from '../api';
import { useStore } from '../store';
import { CardRow } from './CardDetail';

export default function Alerts() {
  const nav = useNavigation<any>();
  const { alerts, triggered, removeAlert } = useStore();
  const watching = alerts.filter((a) => !triggered.includes(a));

  const head = (title: string, count: string, icon?: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ? <Ionicons name="notifications-outline" size={22} color={colors.amber} /> : null}
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{title}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 16 }}>{count}</Text>
    </View>
  );

  const row = (a: (typeof alerts)[number]) => (
    <CardRow
      key={a.key}
      card={a.card}
      onPress={() => nav.navigate('CardDetail', { card: a.card })}
      right={
        <Pressable onPress={() => removeAlert(a.key)}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      }
    />
  );

  return (
    <Screen>
      <PageHead
        eyebrow="Notifications"
        title="Alerts, wishlist targets and milestones"
        text="Every alert is checked against the stored market price and shows the reading it was judged on. Alerts never fire on a guess — a card without a current price stays unverified."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={() => nav.navigate('Wishlist')}>
          <Chip label="♡  Wishlist" />
        </Pressable>
        <Chip label="Email & notifications" />
      </View>
      <Panel style={{ gap: 6, borderRadius: 24 }}>
        {head('Triggered alerts', `${triggered.length} fired`, true)}
        {triggered.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 18, lineHeight: 28, textAlign: 'center', padding: 24 }}>
            No alert has fired yet. Open any card and set a target price to start watching it.
          </Text>
        ) : (
          triggered.map((a) => (
            <View key={a.key}>
              {row(a)}
              <Text style={{ color: colors.muted, marginBottom: 6 }}>
                Target {a.direction} {formatMoney(a.target)} · judged on {formatMoney(marketPrice(a.card))}
              </Text>
            </View>
          ))
        )}
      </Panel>
      <Panel style={{ gap: 6, borderRadius: 24 }}>
        {head('Watching', `${watching.length} alerts`)}
        {watching.length === 0 ? (
          <Empty icon="notifications-outline" text="Nothing is being watched yet." />
        ) : (
          watching.map(row)
        )}
      </Panel>
    </Screen>
  );
}
