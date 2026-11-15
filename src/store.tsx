import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertEntry, Card, Listing, OwnedEntry } from './types';
import { marketPrice } from './api';

type Store = {
  owned: OwnedEntry[];
  alerts: AlertEntry[];
  listings: Listing[];
  recent: string[];
  addOwned: (e: Omit<OwnedEntry, 'key'>) => void;
  removeOwned: (key: string) => void;
  addAlert: (card: Card, target: number, direction: 'below' | 'above') => void;
  removeAlert: (key: string) => void;
  addListing: (l: Omit<Listing, 'key' | 'saved' | 'mine'>) => void;
  toggleSaved: (key: string) => void;
  logActivity: (text: string) => void;
  /** Alerts that fired against the stored market price. Cards with no price never fire. */
  triggered: AlertEntry[];
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
};

const Ctx = createContext<Store | null>(null);
const KEY = 'pokeasset.v1';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw);
        setOwned(s.owned ?? []);
        setAlerts(s.alerts ?? []);
        setListings(s.listings ?? []);
        setRecent(s.recent ?? []);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ owned, alerts, listings, recent })).catch(() => {});
  }, [owned, alerts, listings, recent, ready]);

  const value = useMemo<Store>(() => {
    const logActivity = (text: string) => setRecent((r) => [text, ...r].slice(0, 20));
    const triggered = alerts.filter((a) => {
      const p = marketPrice(a.card);
      if (p == null) return false;
      return a.direction === 'below' ? p <= a.target : p >= a.target;
    });
    return {
      owned,
      alerts,
      listings,
      recent,
      triggered,
      menuOpen,
      setMenuOpen,
      logActivity,
      addOwned: (e) => {
        setOwned((o) => [...o, { ...e, key: uid() }]);
        logActivity(`Added ${e.card.name} to your collection`);
      },
      removeOwned: (key) => setOwned((o) => o.filter((x) => x.key !== key)),
      addAlert: (card, target, direction) => {
        setAlerts((a) => [...a, { key: uid(), card, target, direction }]);
        logActivity(`Watching ${card.name}`);
      },
      removeAlert: (key) => setAlerts((a) => a.filter((x) => x.key !== key)),
      addListing: (l) => {
        setListings((x) => [{ ...l, key: uid(), saved: false, mine: true }, ...x]);
        logActivity(`Created listing: ${l.title}`);
      },
      toggleSaved: (key) =>
        setListings((x) => x.map((l) => (l.key === key ? { ...l, saved: !l.saved } : l))),
    };
  }, [owned, alerts, listings, recent, menuOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
