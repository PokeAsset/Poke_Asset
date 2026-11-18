import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Btn, Chip, Empty, PageHead, Panel, Screen } from '../ui';
import { formatDate, formatMoney, marketPrice } from '../api';
import { useStore } from '../store';
import { CardRow } from './CardDetail';

export default function Alerts() {
  const nav = useNavigation<any>();
  const { alerts, triggered, removeAlert, refreshPrices, refreshing, refreshError, lastRefreshed } = useStore();
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
    <View key={a.key} style={{ paddingBottom: 8 }}>
      <CardRow
        card={a.card}
        onPress={() => nav.navigate('CardDetail', { card: a.card })}
        right={
          <Pressable onPress={() => removeAlert(a.key)}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        }
      />
      <Text style={{ color: colors.muted, marginTop: 6 }}>
        Alert if {a.direction} {formatMoney(a.target)} · now {formatMoney(marketPrice(a.card))}
        {marketPrice(a.card) == null ? ' (no price — unverified)' : ''}
      </Text>
    </View>
  );

  return (
    <Screen>
      <PageHead
        eyebrow="Notifications"
        title="Alerts, wishlist targets and milestones"
        text="Every alert is checked against the stored market price. Alerts never fire on a guess — a card without a current price stays unverified."
      />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pressable onPress={() => nav.navigate('Wishlist')}>
          <Chip label="♡  Wishlist" />
        </Pressable>
        <Btn label={refreshing ? 'Refreshing…' : 'Refresh prices'} icon="refresh" disabled={refreshing} onPress={() => refreshPrices()} />
      </View>
      <Text style={{ color: refreshError ? colors.red : colors.muted }}>
        {refreshError
          ? `Last refresh failed: ${refreshError}`
          : lastRefreshed
          ? `Prices last refreshed ${formatDate(lastRefreshed)}`
          : 'Prices have not been refreshed yet.'}
      </Text>
      <Panel style={{ gap: 6, borderRadius: 24 }}>
        {head('Triggered alerts', `${triggered.length} fired`, true)}
        {triggered.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 18, lineHeight: 28, textAlign: 'center', padding: 24 }}>
            No alert has fired yet. Open any card and set a target price to start watching it.
          </Text>
        ) : (
          triggered.map(row)
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
