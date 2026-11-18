import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { Btn, Chip, Empty, Loading, PageHead, Panel, Screen, Segmented } from '../ui';
import { useAuth } from '../auth';
import {
  adminHandleReport,
  adminListings,
  adminOrders,
  adminRecentEvents,
  adminReports,
  checkAdmin,
  flagsFor,
  HistoryEvent,
  ListingStatus,
  MarketListing,
  MarketOrder,
  MarketReport,
  updateListing,
} from '../market';
import { dollars, Field, Gate, StatusPill, when } from '../marketUi';

const TABS = ['Overview', 'Listings', 'Reports', 'Activity'];
const STATUS_FILTERS: (ListingStatus | 'all')[] = ['all', 'available', 'reserved', 'sold', 'removed'];

const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <View style={{ flexGrow: 1, minWidth: 140, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, backgroundColor: colors.card, gap: 2 }}>
    <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }}>{label.toUpperCase()}</Text>
    <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{value}</Text>
    {sub ? <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text> : null}
  </View>
);

function Ops() {
  const auth = useAuth();
  const uid = auth.session!.userId;
  const [tab, setTab] = useState(TABS[0]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ListingStatus | 'all'>('all');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [l, r, o, e] = await Promise.all([adminListings(auth.rest), adminReports(auth.rest, 'open'), adminOrders(auth.rest), adminRecentEvents(auth.rest)]);
      setListings(l);
      setReports(r);
      setOrders(o);
      setEvents(e);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load marketplace data.');
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);
  const reportCount = useMemo(() => {
    const m = new Map<string, number>();
    reports.forEach((r) => m.set(r.listing_id, (m.get(r.listing_id) ?? 0) + 1));
    return m;
  }, [reports]);
  const recentBySeller = useMemo(() => {
    const m = new Map<string, number>();
    const cutoff = Date.now() - 24 * 3600 * 1000;
    listings.forEach((l) => {
      if (new Date(l.created_at).getTime() > cutoff) m.set(l.seller_id, (m.get(l.seller_id) ?? 0) + 1);
    });
    return m;
  }, [listings]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setMsg(done);
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (l: MarketListing, thenReport?: string) =>
    act(async () => {
      await updateListing(auth.rest, l.id, { status: 'removed', admin_removed: true, removed_reason: reason.trim() || 'Removed by a moderator' });
      if (thenReport) await adminHandleReport(auth.rest, thenReport, uid, 'actioned');
    }, `Removed “${l.title}”.`);
  const restore = (l: MarketListing) =>
    act(() => updateListing(auth.rest, l.id, { status: 'available', admin_removed: false, removed_reason: null }), `Restored “${l.title}”.`);
  const setStatus = (l: MarketListing, status: ListingStatus) => act(() => updateListing(auth.rest, l.id, { status }), `Set “${l.title}” to ${status}.`);

  if (!loaded) return <Loading />;
  if (error) return <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text>;

  const active = listings.filter((l) => l.status === 'available' || l.status === 'reserved');
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const inApp = orders.filter((o) => o.source === 'pokeasset');
  const shownListings = listings.filter((l) => filter === 'all' || l.status === filter);

  return (
    <>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      {msg ? <Text style={{ color: colors.amber, lineHeight: 22 }}>{msg}</Text> : null}
      <View style={{ alignSelf: 'flex-start' }}>
        <Btn icon="refresh-outline" label="Refresh" disabled={busy} onPress={load} />
      </View>

      {tab === 'Overview' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Tile label="Active listings" value={String(active.length)} sub={`${listings.length} ever listed`} />
            <Tile label="Listed value" value={dollars(active.reduce((n, l) => n + l.price * l.qty, 0))} sub="asking prices, available + reserved" />
            <Tile label="Sellers" value={String(new Set(listings.map((l) => l.seller_id)).size)} />
            <Tile label="New this week" value={String(listings.filter((l) => new Date(l.created_at).getTime() > week).length)} sub="listings" />
            <Tile label="Open reports" value={String(reports.length)} />
            <Tile label="Removed by admin" value={String(listings.filter((l) => l.admin_removed).length)} />
            <Tile label="In-app requests" value={String(inApp.length)} sub={`${inApp.filter((o) => o.status === 'completed').length} completed · no payments processed`} />
            <Tile label="Sold listings" value={String(listings.filter((l) => l.status === 'sold').length)} />
          </View>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Figures are counted from the marketplace tables you can see as an administrator (most recent 500 listings and orders).
          </Text>
        </>
      ) : null}

      {tab === 'Listings' ? (
        <>
          <Field label="Reason (shown to the seller when you remove a listing)" value={reason} onChangeText={setReason} maxLength={200} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} label={s} active={filter === s} onPress={() => setFilter(s)} />
            ))}
          </View>
          {shownListings.length === 0 ? (
            <Panel>
              <Empty icon="list-outline" text="No listings with that status." />
            </Panel>
          ) : null}
          {shownListings.slice(0, 100).map((l) => {
            const flags = flagsFor(l, reportCount.get(l.id) ?? 0, recentBySeller.get(l.seller_id) ?? 0);
            return (
              <Panel key={l.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{l.title}</Text>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{dollars(l.price)}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {l.seller_name} · {l.kind} · qty {l.qty}
                  {l.market_price != null ? ` · market ${dollars(l.market_price)}` : ''} · {when(l.created_at)}
                </Text>
                <StatusPill status={l.status} />
                {flags.map((f) => (
                  <Text key={f} style={{ color: colors.amber, fontSize: 13 }}>⚠ {f}</Text>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {l.status === 'removed' ? (
                    <Btn label="Restore" disabled={busy} onPress={() => restore(l)} />
                  ) : (
                    <>
                      <Btn icon="trash-outline" label="Remove" disabled={busy} onPress={() => remove(l)} />
                      {(['available', 'reserved', 'sold'] as ListingStatus[])
                        .filter((s) => s !== l.status)
                        .map((s) => (
                          <Btn key={s} label={`Set ${s}`} disabled={busy} onPress={() => setStatus(l, s)} />
                        ))}
                    </>
                  )}
                </View>
              </Panel>
            );
          })}
        </>
      ) : null}

      {tab === 'Reports' ? (
        <>
          <Field label="Reason (shown to the seller when you remove a listing)" value={reason} onChangeText={setReason} maxLength={200} />
          {reports.length === 0 ? (
            <Panel>
              <Empty icon="shield-checkmark-outline" text="No open reports." />
            </Panel>
          ) : null}
          {reports.map((r) => {
            const l = byId.get(r.listing_id);
            return (
              <Panel key={r.id} style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{l ? l.title : 'Listing no longer available'}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {l ? `${l.seller_name} · ${dollars(l.price)} · ${l.status}` : ''} · reported {when(r.created_at)}
                </Text>
                <Text style={{ color: colors.text, lineHeight: 21 }}>“{r.reason}”</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {l && l.status !== 'removed' ? <Btn icon="trash-outline" label="Remove listing" disabled={busy} onPress={() => remove(l, r.id)} /> : null}
                  <Btn label="Dismiss report" disabled={busy} onPress={() => act(() => adminHandleReport(auth.rest, r.id, uid, 'dismissed'), 'Report dismissed.')} />
                </View>
              </Panel>
            );
          })}
        </>
      ) : null}

      {tab === 'Activity' ? (
        <>
          <Panel style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Recent listing activity</Text>
            {events.length === 0 ? <Text style={{ color: colors.muted }}>Nothing yet.</Text> : null}
            {events.map((e) => (
              <Text key={e.id} style={{ color: colors.muted, fontSize: 13 }}>
                {when(e.created_at)} · {byId.get(e.listing_id ?? '')?.title ?? 'listing'} · {e.event}
                {e.detail ? ` · ${e.detail}` : ''}
              </Text>
            ))}
          </Panel>
          <Panel style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Recent in-app requests</Text>
            {inApp.length === 0 ? <Text style={{ color: colors.muted }}>Nothing yet.</Text> : null}
            {inApp.slice(0, 40).map((o) => (
              <Text key={o.id} style={{ color: colors.muted, fontSize: 13 }}>
                {when(o.created_at)} · {o.title} · {o.qty} × {dollars(o.price)} · {o.status}
              </Text>
            ))}
          </Panel>
        </>
      ) : null}
    </>
  );
}

function AdminCheck() {
  const auth = useAuth();
  const [ok, setOk] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    checkAdmin(auth.rest, auth.session!.userId)
      .then(setOk)
      .catch((e) => {
        setErr(e?.message ?? 'Could not check your access.');
        setOk(false);
      });
  }, []);
  if (ok === null) return <Loading />;
  if (!ok) {
    return (
      <Panel style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Administrators only</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          {err || 'Your account is not on the administrators list. This is enforced by the database, so hiding or showing this page does not grant access. See the README to add an administrator.'}
        </Text>
      </Panel>
    );
  }
  return <Ops />;
}

/** Menu → Marketplace ops. Moderation and analytics, limited to accounts in the admins table. */
export default function MarketOps() {
  return (
    <Screen>
      <PageHead
        eyebrow="Business"
        title="Marketplace operations"
        text="Review listings and reports, remove inappropriate or fraudulent listings, set statuses and watch marketplace activity."
      />
      <Gate what="Marketplace operations">
        <AdminCheck />
      </Gate>
    </Screen>
  );
}
