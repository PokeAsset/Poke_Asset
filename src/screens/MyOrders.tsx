import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors } from '../theme';
import { Btn, Chip, Empty, Loading, PageHead, Panel, Screen, Segmented } from '../ui';
import { useAuth } from '../auth';
import { HistoryEvent, listOrders, logExternalOrder, MarketOrder, OrderStatus, orderHistory, updateOrder } from '../market';
import { dollars, Field, Gate, OrderBadge, StatusPill, when } from '../marketUi';

const EXTERNAL_STATUSES: OrderStatus[] = ['requested', 'shipped', 'completed', 'cancelled'];

function OrderCard({ o, role, onChanged }: { o: MarketOrder; role: 'buyer' | 'seller'; onChanged: (n: MarketOrder) => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<HistoryEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const change = async (status: OrderStatus) => {
    setBusy(true);
    setErr('');
    try {
      onChanged(await updateOrder(auth.rest, o.id, { status }));
      setHist(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update the order.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !hist) {
      try {
        setHist(await orderHistory(auth.rest, o.id));
      } catch (e: any) {
        setErr(e?.message ?? 'Could not load history.');
      }
    }
  };

  const ext = o.source === 'external';
  return (
    <Panel style={{ gap: 8 }}>
      <Pressable onPress={toggle} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{o.title}</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{dollars(o.price * o.qty)}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {o.qty} × {dollars(o.price)} · {role === 'buyer' ? `Seller: ${o.seller_name ?? (ext ? o.platform ?? 'outside seller' : 'unknown')}` : 'Buyer request'} · {when(o.created_at)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill status={o.status} />
          <OrderBadge o={o} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            {ext
              ? 'You logged this purchase yourself. PokéAsset did not process it.'
              : 'Payment: not processed by PokéAsset. The buyer and seller arrange payment and shipping between themselves.'}
          </Text>
          {o.note ? <Text style={{ color: colors.text, lineHeight: 21 }}>Note: {o.note}</Text> : null}
          {o.external_url ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn icon="open-outline" label="Open link" onPress={() => Linking.openURL(o.external_url!).catch(() => {})} />
            </View>
          ) : null}

          {!ext && role === 'seller' ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'requested' ? (
                <>
                  <Btn kind="gold" label="Accept" disabled={busy} onPress={() => change('accepted')} />
                  <Btn label="Decline" disabled={busy} onPress={() => change('declined')} />
                </>
              ) : null}
              {o.status === 'accepted' ? <Btn kind="gold" label="Mark shipped" disabled={busy} onPress={() => change('shipped')} /> : null}
              {o.status === 'accepted' || o.status === 'shipped' ? <Btn label="Mark completed (sold)" disabled={busy} onPress={() => change('completed')} /> : null}
            </View>
          ) : null}
          {!ext && role === 'buyer' && (o.status === 'requested' || o.status === 'accepted') ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn label="Cancel request" disabled={busy} onPress={() => change('cancelled')} />
            </View>
          ) : null}
          {ext ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {EXTERNAL_STATUSES.map((s) => (
                <Chip key={s} label={s} active={o.status === s} onPress={() => (o.status === s || busy ? undefined : change(s))} />
              ))}
            </View>
          ) : null}
          {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}

          <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' }}>ORDER HISTORY</Text>
          {hist === null ? <Text style={{ color: colors.muted }}>Loading…</Text> : null}
          {hist?.map((h) => (
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

function ExternalForm({ onAdded }: { onAdded: (o: MarketOrder) => void }) {
  const auth = useAuth();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [platform, setPlatform] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const p = parseFloat(price);
    const q = parseInt(qty, 10);
    if (title.trim().length < 2) return setMsg({ ok: false, text: 'Add what you bought.' });
    if (!(p >= 0)) return setMsg({ ok: false, text: 'Enter the price you paid each.' });
    if (!(q >= 1)) return setMsg({ ok: false, text: 'Quantity must be at least 1.' });
    setBusy(true);
    setMsg(null);
    try {
      const o = await logExternalOrder(auth.rest, auth.session!.userId, {
        title: title.trim(),
        price: p,
        qty: q,
        platform: platform.trim() || 'Other',
        external_url: /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined,
        note: note.trim(),
      });
      onAdded(o);
      setTitle('');
      setPrice('');
      setQty('1');
      setUrl('');
      setNote('');
      setMsg({ ok: true, text: 'Saved to your orders.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Log a purchase made elsewhere</Text>
      <Text style={{ color: colors.muted, lineHeight: 21 }}>
        For things you bought on TCGplayer, eBay, a card shop or in person. These are your own records; PokéAsset did not process them.
      </Text>
      <Field label="What you bought" value={title} onChangeText={setTitle} maxLength={140} />
      <Field label="Price paid each ($)" value={price} onChangeText={setPrice} numeric />
      <Field label="Quantity" value={qty} onChangeText={setQty} numeric />
      <Field label="Where (platform or shop)" value={platform} onChangeText={setPlatform} placeholder="TCGplayer, eBay, local shop…" />
      <Field label="Order link (optional)" value={url} onChangeText={setUrl} placeholder="https://…" />
      <Field label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />
      {msg ? <Text style={{ color: msg.ok ? colors.green : colors.red }}>{msg.text}</Text> : null}
      <View style={{ alignSelf: 'flex-start' }}>
        <Btn kind="gold" icon="add" label={busy ? 'Saving…' : 'Save purchase'} disabled={busy} onPress={save} />
      </View>
    </Panel>
  );
}

function Body() {
  const auth = useAuth();
  const uid = auth.session!.userId;
  const [tab, setTab] = useState('Buying');
  const [buying, setBuying] = useState<MarketOrder[] | null>(null);
  const [selling, setSelling] = useState<MarketOrder[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([listOrders(auth.rest, uid, 'buyer'), listOrders(auth.rest, uid, 'seller')])
      .then(([b, s]) => {
        if (!live) return;
        setBuying(b);
        setSelling(s);
      })
      .catch((e) => live && setError(e?.message ?? 'Could not load orders.'));
    return () => {
      live = false;
    };
  }, [uid]);

  const swap = (list: MarketOrder[] | null, n: MarketOrder) => (list ?? []).map((x) => (x.id === n.id ? n : x));
  const pending = (selling ?? []).filter((o) => o.status === 'requested').length;
  const list = tab.startsWith('Selling') ? selling : buying;
  const role = tab.startsWith('Selling') ? 'seller' : 'buyer';

  return (
    <>
      <Segmented
        options={['Buying', `Selling${pending ? ` (${pending} new)` : ''}`, 'Log outside purchase']}
        value={tab.startsWith('Selling') ? `Selling${pending ? ` (${pending} new)` : ''}` : tab}
        onChange={setTab}
      />
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {tab === 'Log outside purchase' ? (
        <ExternalForm onAdded={(o) => setBuying((b) => [o, ...(b ?? [])])} />
      ) : (
        <>
          {list === null && !error ? <Loading /> : null}
          {list && list.length === 0 ? (
            <Panel>
              <Empty
                icon="receipt-outline"
                text={role === 'buyer' ? 'No orders yet. Request an item in the Store, or log a purchase you made elsewhere.' : 'No one has requested your listings yet.'}
              />
            </Panel>
          ) : null}
          {(list ?? []).map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              role={role}
              onChanged={(n) => (role === 'buyer' ? setBuying((l) => swap(l, n)) : setSelling((l) => swap(l, n)))}
            />
          ))}
        </>
      )}
    </>
  );
}

/** Menu → My orders. Requests you made, requests on your listings, and purchases you logged from elsewhere. */
export default function MyOrders() {
  return (
    <Screen>
      <PageHead
        eyebrow="Community"
        title="My orders"
        text="Requests to buy, requests from buyers, and purchases you logged. Orders made inside PokéAsset are labelled separately from outside purchases, and PokéAsset never marks anything as paid."
      />
      <Gate what="Orders">
        <Body />
      </Gate>
    </Screen>
  );
}
