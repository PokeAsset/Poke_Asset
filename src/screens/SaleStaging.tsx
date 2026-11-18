import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Chip, Empty, Loading, PageHead, Panel, PhotoSlot, Screen, Segmented, usePhoto } from '../ui';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { marketPrice } from '../api';
import { createListing, HistoryEvent, listingHistory, listListings, ListingStatus, MarketListing, updateListing } from '../market';
import { dollars, Field, Gate, StatusPill, Thumb, when } from '../marketUi';

const NAME_KEY = 'pokeasset.sellername';
const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged', 'Sealed'];
const STATUSES: ListingStatus[] = ['available', 'reserved', 'sold'];

type Draft = {
  kind: 'card' | 'sealed';
  title: string;
  set_name: string;
  grade: string;
  market_price: number | null;
  market_source: string | null;
  image_url: string | null;
  maxQty: number;
};
const EMPTY: Draft = { kind: 'card', title: '', set_name: '', grade: '', market_price: null, market_source: null, image_url: null, maxQty: 999 };

function MyListing({ l, onChanged }: { l: MarketListing; onChanged: (n: MarketListing) => void }) {
  const auth = useAuth();
  const nav = useNavigation<any>();
  const [price, setPrice] = useState(String(l.price));
  const [qty, setQty] = useState(String(l.qty));
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = l.admin_removed;

  const patch = async (p: Partial<MarketListing>) => {
    setBusy(true);
    setErr('');
    try {
      onChanged(await updateListing(auth.rest, l.id, p));
      setEditing(false);
      setHistory(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const showHistory = async () => {
    if (history) return setHistory(null);
    try {
      setHistory(await listingHistory(auth.rest, l.id));
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load history.');
    }
  };

  return (
    <Panel style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Thumb l={l} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{l.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {[l.kind === 'card' ? 'Card' : 'Sealed', l.set_name, l.grade, l.condition, `qty ${l.qty}`].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
            {dollars(l.price)}
            {l.market_price != null ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '500' }}>{`  market ${dollars(l.market_price)}`}</Text> : null}
          </Text>
          <StatusPill status={l.status} />
        </View>
      </View>
      {locked ? (
        <Text style={{ color: colors.red, lineHeight: 20 }}>
          A moderator removed this listing{l.removed_reason ? `: ${l.removed_reason}` : '.'} It can no longer be edited.
        </Text>
      ) : l.status !== 'removed' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Mark as:</Text>
            {STATUSES.map((s) => (
              <Chip key={s} label={s} active={l.status === s} onPress={() => (l.status === s || busy ? undefined : patch({ status: s }))} />
            ))}
          </View>
          {editing ? (
            <View style={{ gap: 10 }}>
              <Field label="Asking price ($)" value={price} onChangeText={setPrice} numeric />
              <Field label="Quantity" value={qty} onChangeText={setQty} numeric />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn
                  kind="gold"
                  label="Save"
                  disabled={busy}
                  onPress={() => {
                    const p = parseFloat(price);
                    const q = parseInt(qty, 10);
                    if (!(p > 0) || !(q >= 1)) return setErr('Enter a price above 0 and a quantity of at least 1.');
                    patch({ price: p, qty: q });
                  }}
                />
                <Btn label="Cancel" onPress={() => setEditing(false)} />
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Btn icon="create-outline" label="Edit price" onPress={() => setEditing(!editing)} />
            <Btn icon="time-outline" label={history ? 'Hide history' : 'History'} onPress={showHistory} />
            <Btn icon="storefront-outline" label="View in Store" onPress={() => nav.navigate('Store', { id: l.id })} />
            <Btn icon="trash-outline" label={confirm ? 'Tap again to remove' : 'Remove'} disabled={busy} onPress={() => (confirm ? patch({ status: 'removed' }) : setConfirm(true))} />
          </View>
        </>
      ) : (
        <Btn icon="refresh-outline" label="Relist" disabled={busy} onPress={() => patch({ status: 'available' })} />
      )}
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      {history ? (
        <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
          {history.length === 0 ? <Text style={{ color: colors.muted }}>No history yet.</Text> : null}
          {history.map((h) => (
            <Text key={h.id} style={{ color: colors.muted, fontSize: 13 }}>
              {when(h.created_at)} · {h.event}
              {h.detail ? ` · ${h.detail}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

function Body() {
  const auth = useAuth();
  const { owned, sealed } = useStore();
  const uid = auth.session!.userId;
  const [tab, setTab] = useState('My listings');
  const [mine, setMine] = useState<MarketListing[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [cond, setCond] = useState(CONDITIONS[1]);
  const [desc, setDesc] = useState('');
  const [name, setName] = useState('');
  const [pickQ, setPickQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p1 = usePhoto();
  const p2 = usePhoto();
  const p3 = usePhoto();

  useEffect(() => {
    AsyncStorage.getItem(NAME_KEY).then((v) => v && setName(v)).catch(() => {});
  }, []);

  const load = async () => {
    try {
      setMine(await listListings(auth.rest, { seller: uid, status: ['available', 'reserved', 'sold', 'removed'], limit: 300 }));
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your listings.');
    }
  };
  useEffect(() => {
    load();
  }, [uid]);

  const picks = useMemo(() => {
    const t = pickQ.trim().toLowerCase();
    const cards = owned.map((e) => ({
      id: `c-${e.key}`,
      label: `${e.card.name} · ${e.card.set.name} #${e.card.number}${e.graded ? ` · ${e.company ?? ''} ${e.grade ?? ''}` : ''}`,
      d: {
        kind: 'card' as const,
        title: `${e.card.name} ${e.card.set.name} #${e.card.number}`,
        set_name: e.card.set.name,
        grade: e.graded ? `${e.company ?? ''} ${e.grade ?? ''}`.trim() : '',
        market_price: marketPrice(e.card, e.variant),
        market_source: 'TCGplayer market price via pokemontcg.io',
        image_url: e.card.images.small,
        maxQty: e.qty,
      },
      cond: e.condition,
    }));
    const seal = sealed.map((s) => ({
      id: `s-${s.key}`,
      label: `${s.name}${s.setName ? ` · ${s.setName}` : ''}`,
      d: {
        kind: 'sealed' as const,
        title: s.name,
        set_name: s.setName ?? '',
        grade: '',
        market_price: s.market,
        market_source: s.market != null ? 'Price service (stored price)' : null,
        image_url: null,
        maxQty: s.qty,
      },
      cond: 'Sealed' as string | undefined,
    }));
    return [...cards, ...seal].filter((x) => !t || x.label.toLowerCase().includes(t)).slice(0, 8);
  }, [owned, sealed, pickQ]);

  const publish = async () => {
    if (busy) return;
    setMsg(null);
    const pr = parseFloat(price);
    const q = parseInt(qty, 10);
    if (draft.title.trim().length < 2) return setMsg({ ok: false, text: 'Add a title (pick from your collection or type one).' });
    if (!(pr > 0)) return setMsg({ ok: false, text: 'Enter an asking price above 0.' });
    if (!(q >= 1)) return setMsg({ ok: false, text: 'Quantity must be at least 1.' });
    if (q > draft.maxQty) return setMsg({ ok: false, text: `You only have ${draft.maxQty} of that in your collection.` });
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const ph of [p1.photo, p2.photo, p3.photo]) if (ph) urls.push(await auth.uploadPhoto(ph.base64, ph.mime));
      const sellerName = name.trim() || 'Collector';
      AsyncStorage.setItem(NAME_KEY, sellerName).catch(() => {});
      const made = await createListing(auth.rest, uid, {
        kind: draft.kind,
        title: draft.title.trim(),
        description: desc.trim(),
        qty: q,
        price: pr,
        seller_name: sellerName,
        set_name: draft.set_name || null,
        grade: draft.grade || null,
        condition: cond,
        market_price: draft.market_price,
        market_source: draft.market_source,
        image_url: draft.image_url,
        photo_urls: urls,
      });
      setMine((m) => [made, ...(m ?? [])]);
      setDraft(EMPTY);
      setPrice('');
      setQty('1');
      setDesc('');
      p1.clear();
      p2.clear();
      p3.clear();
      setMsg({ ok: true, text: 'Listed. It is now in the Store and in My listings.' });
      setTab('My listings');
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not publish.' });
    } finally {
      setBusy(false);
    }
  };

  const counts = (s: ListingStatus) => (mine ?? []).filter((l) => l.status === s).length;

  return (
    <>
      <Segmented options={['My listings', 'New listing']} value={tab} onChange={setTab} />
      {msg ? <Text style={{ color: msg.ok ? colors.green : colors.red, lineHeight: 22 }}>{msg.text}</Text> : null}

      {tab === 'New listing' ? (
        <Panel style={{ gap: 14 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Choose something from your collection</Text>
          <Field label="Search your collection" value={pickQ} onChangeText={setPickQ} placeholder="Card or sealed product" />
          {picks.length === 0 ? <Text style={{ color: colors.muted }}>Nothing matches. You can also type the details below.</Text> : null}
          {picks.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => {
                setDraft(x.d);
                if (x.cond) setCond(CONDITIONS.includes(x.cond) ? x.cond : CONDITIONS[1]);
                if (x.d.market_price != null && !price) setPrice(String(x.d.market_price));
              }}
              style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ color: colors.text }}>{x.label}</Text>
            </Pressable>
          ))}

          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6 }}>Listing details</Text>
          <Segmented options={['Card', 'Sealed']} value={draft.kind === 'card' ? 'Card' : 'Sealed'} onChange={(v) => setDraft({ ...draft, kind: v === 'Card' ? 'card' : 'sealed' })} />
          <Field label="Title" value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder="e.g. Charizard ex Obsidian Flames #125" maxLength={140} />
          <Field label="Set" value={draft.set_name} onChangeText={(t) => setDraft({ ...draft, set_name: t })} />
          {draft.kind === 'card' ? <Field label="Grade (optional)" value={draft.grade} onChangeText={(t) => setDraft({ ...draft, grade: t })} placeholder="PSA 10" /> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {CONDITIONS.map((c) => (
              <Chip key={c} label={c} active={cond === c} onPress={() => setCond(c)} />
            ))}
          </View>
          <Field label="Asking price per item ($)" value={price} onChangeText={setPrice} numeric />
          {draft.market_price != null ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Recorded market price: {dollars(draft.market_price)} ({draft.market_source ?? 'stored price'}). Buyers see it beside your price.
            </Text>
          ) : null}
          <Field label={`Quantity${draft.maxQty < 999 ? ` (you have ${draft.maxQty})` : ''}`} value={qty} onChangeText={setQty} numeric />
          <Field label="Description" value={desc} onChangeText={setDesc} multiline maxLength={2000} placeholder="Condition notes, shipping, what is included" />
          <Field label="Your seller name" value={name} onChangeText={setName} placeholder="Shown to buyers (not your email)" maxLength={40} />
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>PHOTOS (UP TO 3, EACH UNDER 3 MB)</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PhotoSlot uri={p1.uri} onPress={p1.choose} />
            <PhotoSlot uri={p2.uri} onPress={p2.choose} />
            <PhotoSlot uri={p3.uri} onPress={p3.choose} />
          </View>
          {p1.error || p2.error || p3.error ? <Text style={{ color: colors.red }}>{p1.error || p2.error || p3.error}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            PokéAsset does not take payment or hold money. Buyers send you a request; you agree the sale and payment directly.
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Btn kind="gold" icon="pricetag-outline" label={busy ? 'Publishing…' : 'Publish listing'} disabled={busy} onPress={publish} />
          </View>
        </Panel>
      ) : (
        <>
          <Text style={{ color: colors.muted }}>
            {mine ? `${counts('available')} available · ${counts('reserved')} reserved · ${counts('sold')} sold` : ''}
          </Text>
          {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
          {mine === null && !error ? <Loading /> : null}
          {mine && mine.length === 0 ? (
            <Panel>
              <Empty icon="pricetag-outline" text="No listings yet. Choose “New listing” to sell a card or sealed product." />
            </Panel>
          ) : null}
          {(mine ?? []).map((l) => (
            <MyListing key={l.id} l={l} onChanged={(n) => setMine((m) => (m ?? []).map((x) => (x.id === n.id ? n : x)))} />
          ))}
        </>
      )}
    </>
  );
}

/** Menu → My sale staging. Pick items from your collection, list them, and manage every listing. */
export default function SaleStaging() {
  return (
    <Screen>
      <PageHead
        eyebrow="Community"
        title="My sale staging"
        text="Turn cards and sealed product from your collection into listings, set asking prices, add photos, and track each one as available, reserved or sold."
      />
      <Gate what="Selling">
        <Body />
      </Gate>
    </Screen>
  );
}
