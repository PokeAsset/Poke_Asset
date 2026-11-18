import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertEntry, Card, GradedInfo, HistoryPoint, Listing, OwnedEntry, SaleEntry, SealedEntry, Snapshot, WishlistEntry } from './types';
import { marketPrice } from './api';
import { loadFreshCards } from './prices';
import { combinedTotals, todayKey, upsertSnapshot } from './portfolio';

export type RefreshResult = { ok: boolean; updated: number; error?: string };

type Store = {
  ready: boolean;
  owned: OwnedEntry[];
  wishlist: WishlistEntry[];
  alerts: AlertEntry[];
  listings: Listing[];
  recent: string[];
  snapshots: Snapshot[];
  lastRefreshed: string | null;
  refreshing: boolean;
  refreshError: string;
  /** graded prices + history from the price service, by card id */
  extras: Record<string, GradedInfo>;
  /** readings saved on this device, by card id */
  history: Record<string, HistoryPoint[]>;
  /** Swap fresh card data in everywhere and save a history point. */
  applyFresh: (cards: Card[]) => void;
  setExtras: (cardId: string, info: GradedInfo) => void;
  sealed: SealedEntry[];
  sales: SaleEntry[];
  addSealed: (s: Omit<SealedEntry, 'key' | 'addedOn'>) => void;
  updateSealed: (key: string, patch: Partial<Omit<SealedEntry, 'key'>>) => void;
  removeSealed: (key: string) => void;
  /** Sell `qty` copies of a card entry at `price` each: reduces the entry and records the sale. */
  sellOwned: (key: string, qty: number, price: number) => void;
  sellSealed: (key: string, qty: number, price: number) => void;
  removeSale: (key: string) => void;
  addOwned: (e: Omit<OwnedEntry, 'key'>) => void;
  updateOwned: (key: string, patch: Partial<Omit<OwnedEntry, 'key' | 'card'>>) => void;
  removeOwned: (key: string) => void;
  addWishlist: (card: Card, target?: number) => void;
  updateWishlist: (key: string, target: number | undefined) => void;
  removeWishlist: (key: string) => void;
  addAlert: (card: Card, target: number, direction: 'below' | 'above') => void;
  removeAlert: (key: string) => void;
  addListing: (l: Omit<Listing, 'key' | 'saved' | 'mine'>) => void;
  toggleSaved: (key: string) => void;
  logActivity: (text: string) => void;
  /** Re-read prices for every card you own, watch or alert on, and record today's portfolio value. */
  refreshPrices: () => Promise<RefreshResult>;
  /** Alerts that fired against the stored market price. Cards with no price never fire. */
  triggered: AlertEntry[];
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
};

const Ctx = createContext<Store | null>(null);
const KEY = 'pokeasset.v2';
const OLD_KEY = 'pokeasset.v1';
const STALE_MS = 6 * 60 * 60 * 1000;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [extras, setExtrasState] = useState<Record<string, GradedInfo>>({});
  const [sealed, setSealed] = useState<SealedEntry[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Always-current copy of the lists, so async refreshes never use stale state.
  const latest = useRef({ owned, wishlist, alerts, sealed });
  latest.current = { owned, wishlist, alerts, sealed };

  useEffect(() => {
    (async () => {
      try {
        let raw = await AsyncStorage.getItem(KEY);
        if (!raw) raw = await AsyncStorage.getItem(OLD_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          setOwned(
            ((s.owned ?? []) as OwnedEntry[]).map((e) => ({
              ...e,
              qty: typeof e.qty === 'number' && e.qty >= 1 ? e.qty : 1,
              cost: typeof e.cost === 'number' ? e.cost : 0,
            })),
          );
          setWishlist((s.wishlist ?? []) as WishlistEntry[]);
          setAlerts(
            ((s.alerts ?? []) as AlertEntry[]).map((a) => ({ ...a, createdOn: a.createdOn ?? todayKey() })),
          );
          setListings((s.listings ?? []) as Listing[]);
          setRecent((s.recent ?? []) as string[]);
          setSnapshots((s.snapshots ?? []) as Snapshot[]);
          setLastRefreshed((s.lastRefreshed ?? null) as string | null);
          setExtrasState((s.extras ?? {}) as Record<string, GradedInfo>);
          setHistory((s.history ?? {}) as Record<string, HistoryPoint[]>);
          setSealed((s.sealed ?? []) as SealedEntry[]);
          setSales((s.sales ?? []) as SaleEntry[]);
        }
      } catch {
        // Corrupt or unavailable storage: start empty rather than crash.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(
      KEY,
      JSON.stringify({ owned, wishlist, alerts, listings, recent, snapshots, lastRefreshed, extras, history, sealed, sales }),
    ).catch(() => {});
  }, [owned, wishlist, alerts, listings, recent, snapshots, lastRefreshed, extras, history, sealed, sales, ready]);

  const logActivity = useCallback((text: string) => {
    setRecent((r) => [text, ...r].slice(0, 20));
  }, []);

  const applyFresh = useCallback((fresh: Card[]) => {
    if (fresh.length === 0) return;
    const byId = new Map<string, Card>();
    fresh.forEach((c) => byId.set(c.id, c));
    const swap = (c: Card): Card => byId.get(c.id) ?? c;
    setOwned((o) => o.map((e) => ({ ...e, card: swap(e.card) })));
    setWishlist((w) => w.map((x) => ({ ...x, card: swap(x.card) })));
    setAlerts((a) => a.map((x) => ({ ...x, card: swap(x.card) })));
    const date = todayKey();
    setHistory((h) => {
      const next = { ...h };
      fresh.forEach((c) => {
        const raw = marketPrice(c);
        if (raw == null) return;
        const prev = next[c.id] ?? [];
        const old = prev.find((p) => p.date === date);
        const point: HistoryPoint = { date, raw, graded: old?.graded ?? {} };
        next[c.id] = [...prev.filter((p) => p.date !== date), point].sort((x, y) => x.date.localeCompare(y.date)).slice(-365);
      });
      return next;
    });
  }, []);

  const setExtras = useCallback((cardId: string, info: GradedInfo) => {
    setExtrasState((x) => ({ ...x, [cardId]: info }));
    const date = todayKey();
    const graded: Record<string, number> = {};
    Object.entries(info.values).forEach(([k, v]) => (graded[k] = v.price));
    setHistory((h) => {
      const prev = h[cardId] ?? [];
      const old = prev.find((p) => p.date === date);
      const point: HistoryPoint = { date, raw: old?.raw ?? null, graded };
      return { ...h, [cardId]: [...prev.filter((p) => p.date !== date), point].sort((a, b) => a.date.localeCompare(b.date)).slice(-365) };
    });
  }, []);

  const refreshPrices = useCallback(async (): Promise<RefreshResult> => {
    const before = latest.current;
    const ids = Array.from(
      new Set([...before.owned, ...before.wishlist, ...before.alerts].map((x) => x.card.id)),
    );
    if (ids.length === 0) return { ok: true, updated: 0 };
    setRefreshing(true);
    try {
      const fresh = await loadFreshCards(ids);
      const byId = new Map<string, Card>();
      fresh.forEach((c) => byId.set(c.id, c));
      const swap = (c: Card): Card => byId.get(c.id) ?? c;

      const nextOwned = latest.current.owned.map((e) => ({ ...e, card: swap(e.card) }));
      applyFresh(fresh);

      const totals = combinedTotals(nextOwned, latest.current.sealed);
      if (nextOwned.length + latest.current.sealed.length > 0 && totals.value > 0) {
        setSnapshots((prev) => upsertSnapshot(prev, { date: todayKey(), value: totals.value, cost: totals.cost }));
      }
      setLastRefreshed(new Date().toISOString());
      setRefreshError('');
      return { ok: true, updated: fresh.length };
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'Price refresh failed';
      setRefreshError(message);
      return { ok: false, updated: 0, error: message };
    } finally {
      setRefreshing(false);
    }
  }, [applyFresh]);

  // Refresh once when the app opens, if the last reading is older than six hours.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!ready || autoRan.current) return;
    autoRan.current = true;
    const age = lastRefreshed ? Date.now() - new Date(lastRefreshed).getTime() : Infinity;
    if (age > STALE_MS) {
      refreshPrices().catch(() => {});
    }
  }, [ready]);

  const value = useMemo<Store>(() => {
    const triggered = alerts.filter((a) => {
      const p = marketPrice(a.card);
      if (p == null) return false;
      return a.direction === 'below' ? p <= a.target : p >= a.target;
    });
    return {
      ready,
      owned,
      wishlist,
      alerts,
      listings,
      recent,
      snapshots,
      lastRefreshed,
      refreshing,
      refreshError,
      extras,
      history,
      applyFresh,
      setExtras,
      triggered,
      menuOpen,
      setMenuOpen,
      logActivity,
      refreshPrices,
      sealed,
      sales,
      addSealed: (it) => {
        setSealed((l) => {
          const same = l.find((x) => (it.productId != null && x.productId === it.productId) || (it.productId == null && x.name === it.name));
          if (same) return l.map((x) => (x === same ? { ...x, qty: x.qty + it.qty, market: it.market ?? x.market, updatedAt: it.updatedAt ?? x.updatedAt } : x));
          return [{ ...it, key: uid(), addedOn: todayKey() }, ...l];
        });
        logActivity(`Added ${it.qty} × ${it.name} (sealed) to your portfolio`);
      },
      updateSealed: (key, patch) => setSealed((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x))),
      removeSealed: (key) => setSealed((l) => l.filter((x) => x.key !== key)),
      sellOwned: (key, qty, price) => {
        const e = latest.current.owned.find((x) => x.key === key);
        if (!e) return;
        const n = Math.min(Math.max(1, Math.floor(qty)), e.qty);
        setSales((l) => [
          { key: uid(), kind: 'card' as const, name: e.card.name, setName: e.card.set.name, qty: n, price, cost: e.cost, date: todayKey() },
          ...l,
        ]);
        setOwned((o) => (n >= e.qty ? o.filter((x) => x.key !== key) : o.map((x) => (x.key === key ? { ...x, qty: x.qty - n } : x))));
        logActivity(`Sold ${n} × ${e.card.name} at $${price.toFixed(2)} each`);
      },
      sellSealed: (key, qty, price) => {
        const e = latest.current.sealed.find((x) => x.key === key);
        if (!e) return;
        const n = Math.min(Math.max(1, Math.floor(qty)), e.qty);
        setSales((l) => [
          { key: uid(), kind: 'sealed' as const, name: e.name, setName: e.setName ?? null, qty: n, price, cost: e.cost, date: todayKey() },
          ...l,
        ]);
        setSealed((o) => (n >= e.qty ? o.filter((x) => x.key !== key) : o.map((x) => (x.key === key ? { ...x, qty: x.qty - n } : x))));
        logActivity(`Sold ${n} × ${e.name} at $${price.toFixed(2)} each`);
      },
      removeSale: (key) => setSales((l) => l.filter((x) => x.key !== key)),
      addOwned: (e) => {
        setOwned((o) => [{ ...e, key: uid() }, ...o]);
        logActivity(`Added ${e.qty} × ${e.card.name} to your collection`);
      },
      updateOwned: (key, patch) =>
        setOwned((o) => o.map((x) => (x.key === key ? { ...x, ...patch } : x))),
      removeOwned: (key) => setOwned((o) => o.filter((x) => x.key !== key)),
      addWishlist: (card, target) => {
        setWishlist((w) =>
          w.some((x) => x.card.id === card.id)
            ? w
            : [{ key: uid(), card, target, addedOn: todayKey() }, ...w],
        );
        logActivity(`Added ${card.name} to your wishlist`);
      },
      updateWishlist: (key, target) =>
        setWishlist((w) => w.map((x) => (x.key === key ? { ...x, target } : x))),
      removeWishlist: (key) => setWishlist((w) => w.filter((x) => x.key !== key)),
      addAlert: (card, target, direction) => {
        setAlerts((a) => [...a, { key: uid(), card, target, direction, createdOn: todayKey() }]);
        logActivity(`Watching ${card.name} ${direction} $${target.toFixed(2)}`);
      },
      removeAlert: (key) => setAlerts((a) => a.filter((x) => x.key !== key)),
      addListing: (l) => {
        setListings((x) => [{ ...l, key: uid(), saved: false, mine: true }, ...x]);
        logActivity(`Created listing: ${l.title}`);
      },
      toggleSaved: (key) =>
        setListings((x) => x.map((l) => (l.key === key ? { ...l, saved: !l.saved } : l))),
    };
  }, [
    ready,
    owned,
    wishlist,
    alerts,
    listings,
    recent,
    snapshots,
    lastRefreshed,
    refreshing,
    refreshError,
    extras,
    history,
    sealed,
    sales,
    applyFresh,
    setExtras,
    menuOpen,
    logActivity,
    refreshPrices,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
