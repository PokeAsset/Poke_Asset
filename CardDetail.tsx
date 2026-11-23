import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, mono, radius, themed } from '../theme';
import { Btn, Panel, Screen, PageHead } from '../ui';
import EntryForm from '../EntryForm';
import { PriceChart, LineSeries } from '../charts';
import { loadFreshCards } from '../prices';
import { fetchGraded } from '../server';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../types';
import { formatDate, formatMoney, marketPrice, priceDetail, variantList } from '../api';
import { Chip } from '../ui';
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
          {card.set.name} · #{card.number}{card.rarity ? ` · ${card.rarity}` : ''}
          {card.tcgplayer?.updatedAt ? ` · updated ${formatDate(card.tcgplayer.updatedAt)}` : ''}
        </Text>
      </View>
      <Text style={r.price}>{formatMoney(marketPrice(card))}</Text>
      {right}
    </Pressable>
  );
}

export default function CardDetail({ route }: any) {
  const nav = useNavigation<any>();
  const [card, setCard] = useState<Card>(route.params.card);
  const {
    owned, wishlist, alerts, addOwned, addWishlist, removeWishlist, addAlert, removeAlert,
    applyFresh, setExtras, extras, history,
  } = useStore();
  const [busy, setBusy] = useState(false);
  const [liveMsg, setLiveMsg] = useState<string[]>([]);
  const variants = variantList(card).filter((v) => v.market != null);
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const d = priceDetail(card, variant);
  const info = extras[card.id];
  const local = history[card.id] ?? [];

  const refreshNow = async () => {
    setBusy(true);
    setLiveMsg([]);
    const msgs: string[] = [];
    try {
      const fresh = await loadFreshCards([card.id]);
      if (fresh[0]) {
        setCard(fresh[0]);
        applyFresh(fresh);
        msgs.push('Catalog price updated.');
      } else {
        msgs.push('The catalog did not return this card.');
      }
    } catch (e: any) {
      msgs.push(`Catalog price: ${e?.message ?? 'failed'}`);
    }
    try {
      const got = await fetchGraded(card);
      if (got) {
        setExtras(card.id, got);
        msgs.push(Object.keys(got.values).length ? 'Graded prices updated.' : 'No graded sales found for this card.');
      } else {
        msgs.push('The price service has no match for this card.');
      }
    } catch (e: any) {
      msgs.push(e?.notConfigured ? 'Graded prices and history are off until the price key is added on the server.' : `Graded prices: ${e?.message ?? 'failed'}`);
    }
    setLiveMsg(msgs);
    setBusy(false);
  };

  const gradedLabels = Array.from(
    new Set([...Object.keys(info?.values ?? {}), ...Object.keys(info?.gradedHistory ?? {}), ...local.flatMap((p) => Object.keys(p.graded))]),
  ).sort((a, b) => {
    const [ca, ga] = a.split(' ');
    const [cb, gb] = b.split(' ');
    return ca === cb ? parseFloat(gb) - parseFloat(ga) : ca.localeCompare(cb);
  });
  const rawLocal = local.filter((p) => p.raw != null).map((p) => ({ date: p.date, price: p.raw as number }));
  const rawSeries = info?.rawHistory && info.rawHistory.length >= 2 ? info.rawHistory : rawLocal;
  const series: LineSeries[] = [{ label: 'Raw', points: rawSeries }];
  gradedLabels.forEach((label) => {
    const srv = info?.gradedHistory?.[label];
    const loc = local.filter((p) => p.graded[label] != null).map((p) => ({ date: p.date, price: p.graded[label] }));
    series.push({ label, points: srv && srv.length >= 2 ? srv : loc });
  });
  const [target, setTarget] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [alertErr, setAlertErr] = useState('');

  const copies = owned.filter((e) => e.card.id === card.id).reduce((n, e) => n + e.qty, 0);
  const wished = wishlist.find((w) => w.card.id === card.id);
  const myAlerts = alerts.filter((a) => a.card.id === card.id);

  const setAlert = (dir: 'below' | 'above') => {
    const n = Number(target);
    if (target.trim() === '' || isNaN(n) || n <= 0) return setAlertErr('Enter a target price like 25.00.');
    setAlertErr('');
    addAlert(card, n, dir);
    setTarget('');
    setNotice(`Alert set: ${dir} ${formatMoney(n)}.`);
  };

  return (
    <Screen>
      <PageHead eyebrow={`${card.set.name} · #${card.number}`} title={card.name} />
      <Image
        source={{ uri: card.images.large }}
        style={{ width: '100%', maxWidth: 380, alignSelf: 'center', aspectRatio: 0.716, borderRadius: 16 }}
        resizeMode="contain"
      />

      <Panel style={{ gap: 10 }}>
        <Text style={r.label}>PRICE HISTORY</Text>
        <PriceChart series={series} />
      </Panel>

      <Panel>
        <Text style={r.label}>STORED MARKET ESTIMATE</Text>
        {variants.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {variants.map((v) => (
              <Chip
                key={v.key}
                label={`${v.label} ${formatMoney(v.market)}`}
                active={d.variant === v.label}
                onPress={() => setVariant(v.key)}
              />
            ))}
          </View>
        ) : null}
        <Text style={r.big}>{formatMoney(d.market)}</Text>
        {d.market != null ? (
          <Text style={r.sub}>
            Low {formatMoney(d.low)} · High {formatMoney(d.high)} · {d.variant}
          </Text>
        ) : null}
        <Text style={[r.sub, { marginTop: 8 }]}>
          {d.market == null
            ? 'No stored price for this card — alerts stay unverified.'
            : `TCGplayer via pokemontcg.io · ${formatDate(d.updatedAt)}. An estimate is not a sale.`}
        </Text>
      </Panel>

      <Panel style={{ gap: 12 }}>
        <Text style={r.label}>LATEST PRICE</Text>
        <Btn
          kind="gold"
          icon="refresh"
          label={busy ? 'Getting latest price…' : 'Get latest price'}
          disabled={busy}
          onPress={refreshNow}
        />
        {liveMsg.map((m) => (
          <Text key={m} style={{ color: colors.muted, fontSize: 14 }}>
            {m}
          </Text>
        ))}
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          The catalog copies TCGplayer’s market price about once a day, so the date above is the real age of the
          number. Graded prices come from recent eBay sales through the price service.
        </Text>
      </Panel>

      <Panel style={{ gap: 10 }}>
        <Text style={r.label}>GRADED VALUES</Text>
        {info && Object.keys(info.values).length > 0 ? (
          <>
            {gradedLabels
              .filter((l) => info.values[l])
              .map((l) => (
                <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>{l}</Text>
                  <Text style={{ color: colors.text, fontFamily: mono, fontWeight: '700' }}>
                    {formatMoney(info.values[l].price)}
                    {info.values[l].sales != null ? `  · ${info.values[l].sales} sales` : ''}
                  </Text>
                </View>
              ))}
            <Text style={{ color: colors.muted, fontSize: 13 }}>Updated {formatDate(info.fetchedAt)} · recent eBay sales</Text>
          </>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
            No graded prices stored for this card yet. Tap “Get latest price” to look them up.
          </Text>
        )}
        <Btn label="Is it worth grading?" icon="speedometer-outline" onPress={() => nav.navigate('Grade', { card })} />
      </Panel>

      {notice ? <Text style={{ color: colors.amber }}>{notice}</Text> : null}

      <Panel style={{ gap: 12 }}>
        <Text style={r.label}>YOUR COPIES · {copies}</Text>
        {adding ? (
          <EntryForm
            variants={variants}
            initial={{ variant: variant ?? variants[0]?.key }}
            submitLabel="Add to my cards"
            onCancel={() => setAdding(false)}
            onSubmit={(v) => {
              addOwned({ card, ...v });
              setAdding(false);
              setNotice(`${card.name} is in your collection.`);
            }}
          />
        ) : (
          <Btn kind="gold" label="Add to collection" icon="add" onPress={() => setAdding(true)} />
        )}
      </Panel>

      <Panel style={{ gap: 12 }}>
        <Text style={r.label}>WISHLIST</Text>
        {wished ? (
          <Btn label="Remove from wishlist" icon="heart" onPress={() => removeWishlist(wished.key)} />
        ) : (
          <Btn label="Add to wishlist" icon="heart-outline" onPress={() => addWishlist(card)} />
        )}
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
        {alertErr ? <Text style={{ color: colors.red }}>{alertErr}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Btn label="Alert if below" onPress={() => setAlert('below')} />
          <Btn label="Alert if above" onPress={() => setAlert('above')} />
        </View>
        {myAlerts.map((a) => (
          <View key={a.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text }}>
              {a.direction} {formatMoney(a.target)}
            </Text>
            <Pressable onPress={() => removeAlert(a.key)}>
              <Text style={{ color: colors.muted }}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </Panel>
    </Screen>
  );
}

const r = themed(() => StyleSheet.create({
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
}));







