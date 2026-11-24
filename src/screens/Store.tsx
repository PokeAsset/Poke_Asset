import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Chip, Empty, Loading, PageHead, Panel, Screen, SearchBox, Segmented, Select } from '../ui';
import { useAuth } from '../auth';
import { epnLink, tcgplayerUrl } from '../server';
import { createReport, listListings, MarketListing, requestToBuy } from '../market';
import { dollars, Field, StatusPill, Thumb, when } from '../marketUi';

const SORTS = ['Newest', 'Price: low to high', 'Price: high to low'];
const KINDS = ['All', 'Cards', 'Sealed'];
const open = (u: string) => Linking.openURL(u).catch(() => {});
const ebayUrl = (q: string) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;

function Detail({ l, onClose, onChanged }: { l: MarketListing; onClose: () => void; onChanged: () => void }) {
  const auth = useAuth();
  const nav = useNavigation<any>();
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const signedIn = auth.status === 'in';
  const mine = signedIn && auth.session?.userId === l.seller_id;
  const photos = l.photo_urls.length ? l.photo_urls : l.image_url ? [l.image_url] : [];
  const vs = l.market_price ? Math.round(((l.price - l.market_price) / l.market_price) * 100) : null;

  const buy = async () => {
    const q = parseInt(qty, 10);
    if (!(q >= 1) || q > l.qty) return setMsg({ ok: false, text: `Choose a quantity from 1 to ${l.qty}.` });
    setBusy(true);
    setMsg(null);
    try {
      await requestToBuy(auth.rest, auth.session!.userId, l.id, q, note.trim());
      setMsg({ ok: true, text: 'Request sent. The seller will accept or decline it. No money has moved; you arrange payment with the seller.' });
      onChanged();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not send the request.' });
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    if (reason.trim().length < 3) return setMsg({ ok: false, text: 'Say briefly what is wrong.' });
    setBusy(true);
    try {
      await createReport(auth.rest, auth.session!.userId, l.id, reason.trim());
      setReporting(false);
      setReason('');
      setMsg({ ok: true, text: 'Thanks. A moderator will review this listing.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not send the report.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ gap: 12 }} border={colors.tintGoldBorder}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusPill status={l.status} />
        <Btn label="Close" icon="close" onPress={onClose} />
      </View>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {photos.map((u) => (
            <Image key={u} source={{ uri: u }} style={{ width: 240, height: 300, borderRadius: radius.md, backgroundColor: colors.tintBlue }} resizeMode="contain" />
          ))}
        </ScrollView>
      ) : null}
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{l.title}</Text>
      <Text style={{ color: colors.muted }}>
        {[l.kind === 'card' ? 'Card' : 'Sealed', l.set_name, l.grade, l.condition, `${l.qty} available`].filter(Boolean).join(' · ')}
      </Text>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{dollars(l.price)} <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '500' }}>each</Text></Text>
      {l.market_price != null ? (
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Market reference: {dollars(l.market_price)}
          {l.market_source ? ` (${l.market_source})` : ''}
          {vs != null ? ` · asking ${vs === 0 ? 'at market' : `${Math.abs(vs)}% ${vs > 0 ? 'above' : 'below'} market`}` : ''}. The market price is an estimate recorded when the listing was made, not a sale.
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>No market reference was recorded for this listing.</Text>
      )}
      {l.description ? <Text style={{ color: colors.text, lineHeight: 22 }}>{l.description}</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Seller: {l.seller_name} · listed {when(l.created_at)}
      </Text>

      {mine ? (
        <Btn label="This is your listing: manage it" icon="create-outline" onPress={() => nav.navigate('SaleStaging')} />
      ) : l.status !== 'available' ? (
        <Text style={{ color: colors.amber }}>This item is {l.status}, so it cannot be requested right now.</Text>
      ) : signedIn ? (
        <View style={{ gap: 10 }}>
          <Field label={`Quantity (up to ${l.qty})`} value={qty} onChangeText={setQty} numeric />
          <Field label="Message to seller (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />
          <View style={{ alignSelf: 'flex-start' }}>
            <Btn kind="gold" icon="paper-plane-outline" label={busy ? 'Sending…' : 'Request to buy'} disabled={busy} onPress={buy} />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            This sends the seller a request. PokéAsset does not take payment, hold money or mark anything paid.
          </Text>
        </View>
      ) : (
        <Btn kind="gold" icon="log-in-outline" label="Sign in to request this item" onPress={() => nav.navigate('Account')} />
      )}

      {msg ? <Text style={{ color: msg.ok ? colors.green : colors.red, lineHeight: 22 }}>{msg.text}</Text> : null}
      {msg?.ok && !reporting ? <Btn label="Go to My orders" icon="receipt-outline" onPress={() => nav.navigate('MyOrders')} /> : null}

      <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' }}>COMPARE ELSEWHERE</Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Btn icon="open-outline" label="TCGplayer" onPress={() => open(tcgplayerUrl(l.title))} />
        <Btn icon="open-outline" label="eBay sold items" onPress={() => open(epnLink(ebayUrl(l.title), 'pokeasset-sold'))} />
        {l.external_url ? <Btn icon="open-outline" label="Original link" onPress={() => open(l.external_url!)} /> : null}
      </View>

      {signedIn && !mine ? (
        reporting ? (
          <View style={{ gap: 8 }}>
            <Field label="What is wrong with this listing?" value={reason} onChangeText={setReason} multiline maxLength={500} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Send report" disabled={busy} onPress={report} />
              <Btn label="Cancel" onPress={() => setReporting(false)} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setReporting(true)}>
            <Text style={{ color: colors.muted, textDecorationLine: 'underline' }}>Report this listing</Text>
          </Pressable>
        )
      ) : null}
    </Panel>
  );
}

/** Menu → Store. Live listings from community sellers, with search, filters and details. */
export default function Store({ route }: any) {
  const auth = useAuth();
  const nav = useNavigation<any>();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('All');
  const [sort, setSort] = useState(SORTS[0]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [items, setItems] = useState<MarketListing[] | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<MarketListing | null>(null);
  const [tick, setTick] = useState(0);
  const wantId: string | undefined = route?.params?.id;

  useEffect(() => {
    if (auth.status === 'off' || auth.status === 'loading') return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const rows = await listListings(auth.rest, {
          q,
          kind: kind === 'Cards' ? 'card' : kind === 'Sealed' ? 'sealed' : '',
          min: parseFloat(min) || undefined,
          max: parseFloat(max) || undefined,
          sort: sort === SORTS[1] ? 'low' : sort === SORTS[2] ? 'high' : 'new',
        });
        if (!live) return;
        setItems(rows);
        setError('');
      } catch (e: any) {
        if (live) setError(e?.message ?? 'Could not load listings.');
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, kind, sort, min, max, tick, auth.status]);

  // opened from "View in Store" on one of your listings
  useEffect(() => {
    if (!wantId || auth.status === 'off' || auth.status === 'loading') return;
    listListings(auth.rest, { id: wantId, status: ['available', 'reserved', 'sold', 'removed'] })
      .then((r) => r[0] && setSel(r[0]))
      .catch(() => {});
  }, [wantId, auth.status]);

  return (
    <Screen>
      <PageHead
        eyebrow="Community"
        title="Store"
        text="Cards and sealed product listed by PokéAsset members. Prices are asking prices set by sellers, shown beside a recorded market reference. PokéAsset does not process payments."
      />
      {auth.status === 'off' ? (
        <Panel>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>The Store needs accounts to be set up</Text>
          <Text style={{ color: colors.muted, lineHeight: 22, marginTop: 6 }}>
            Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and run supabase/marketplace.sql. Until then you can still compare prices on TCGplayer or eBay from any card or sealed page.
          </Text>
        </Panel>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Btn kind="gold" icon="pricetag-outline" label="Sell something" onPress={() => nav.navigate('SaleStaging')} />
            <Btn icon="receipt-outline" label="My orders" onPress={() => nav.navigate('MyOrders')} />
          </View>
          <SearchBox value={q} onChangeText={setQ} placeholder="Search by card, product, set or seller…" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {KINDS.map((k) => (
              <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              ['Min $', min, setMin],
              ['Max $', max, setMax],
            ].map(([ph, v, set]) => (
              <TextInput
                key={ph as string}
                value={v as string}
                onChangeText={set as (t: string) => void}
                placeholder={ph as string}
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, color: colors.text, backgroundColor: colors.card, fontSize: 16 }}
              />
            ))}
          </View>
          <Select value={sort} options={SORTS} onChange={setSort} />

          {sel ? <Detail l={sel} onClose={() => setSel(null)} onChanged={() => setTick((t) => t + 1)} /> : null}
          {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
          {items === null && !error ? <Loading /> : null}
          {items && items.length === 0 ? (
            <Panel>
              <Empty icon="storefront-outline" title="No listings match" text="Try different filters, or be the first to list something." />
            </Panel>
          ) : null}
          {(items ?? []).map((l) => (
            <Pressable key={l.id} onPress={() => setSel(l)}>
              <Panel style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Thumb l={l} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={2}>{l.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
                    {[l.kind === 'card' ? 'Card' : 'Sealed', l.set_name, l.grade, l.condition].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>by {l.seller_name}</Text>
                  <StatusPill status={l.status} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{dollars(l.price)}</Text>
                  {l.market_price != null ? <Text style={{ color: colors.muted, fontSize: 12 }}>market {dollars(l.market_price)}</Text> : null}
                </View>
              </Panel>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
