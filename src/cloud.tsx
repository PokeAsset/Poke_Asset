import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth';
import { StoredData, useStore } from './store';

/**
 * Keeps a signed-in person's portfolio saved in their account (one row in the `portfolios` table) and
 * loads it on any device they sign in on. Signed-out people keep using the data on their device only.
 */

export type CloudStatus = 'off' | 'signedOut' | 'checking' | 'conflict' | 'saving' | 'synced' | 'error';
export type Conflict = { savedAt: string | null; items: number; data: Partial<StoredData> };

type Cloud = {
  status: CloudStatus;
  lastSynced: string | null;
  error: string;
  conflict: Conflict | null;
  /** Save this device's portfolio to the account now. */
  syncNow: () => Promise<void>;
  /** On first sign-in when both have data: keep the account copy and replace this device's. */
  keepCloudCopy: () => void;
  /** On first sign-in when both have data: keep this device's copy and replace the account's. */
  keepThisDevice: () => Promise<void>;
};

const Ctx = createContext<Cloud | null>(null);

const isEmpty = (d: Partial<StoredData>) =>
  !(d.owned?.length || d.wishlist?.length || d.alerts?.length || d.sealed?.length || d.sales?.length);
const countItems = (d: Partial<StoredData>) => (d.owned?.length ?? 0) + (d.sealed?.length ?? 0);

async function problem(res: Response): Promise<string> {
  let j: any = null;
  try {
    j = await res.json();
  } catch {
    // ignore
  }
  const m = String(j?.message || j?.msg || j?.error || '');
  if (/portfolios/.test(m) && /(find|exist|relation)/i.test(m)) {
    return 'The cloud table is not set up yet. Run supabase/setup.sql in your Supabase project (SQL Editor).';
  }
  return m || `Cloud request failed (${res.status}).`;
}

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const store = useStore();
  const [status, setStatus] = useState<CloudStatus>('off');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const userId = auth.session?.userId ?? null;
  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  const json = useMemo(() => JSON.stringify(store.data), [store.data]);
  const lastPushed = useRef('');
  /** the text of the last save that failed, so a failing save is not retried in a loop */
  const failedJson = useRef('');
  const pushing = useRef(false);
  /** the person whose first sync has finished; saving only starts after that */
  const settled = useRef<string | null>(null);

  const push = useCallback(async () => {
    if (!userId || pushing.current) return;
    pushing.current = true;
    const snapshot = dataRef.current;
    const text = JSON.stringify(snapshot);
    setStatus('saving');
    try {
      const res = await auth.rest('portfolios?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: userId, data: snapshot, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(await problem(res));
      lastPushed.current = text;
      failedJson.current = '';
      setLastSynced(new Date().toISOString());
      setError('');
      setStatus('synced');
    } catch (e: any) {
      failedJson.current = text;
      setError(e?.message ?? 'Could not save to your account.');
      setStatus('error');
    } finally {
      pushing.current = false;
    }
  }, [auth, userId]);

  // First check after signing in: compare the account's copy with this device.
  useEffect(() => {
    if (auth.status === 'off') {
      setStatus('off');
      return;
    }
    if (!userId) {
      settled.current = null;
      setConflict(null);
      setStatus(auth.status === 'loading' ? 'off' : 'signedOut');
      return;
    }
    if (!store.ready || settled.current === userId) return;
    let live = true;
    (async () => {
      setStatus('checking');
      setError('');
      try {
        const res = await auth.rest(`portfolios?select=data,updated_at&user_id=eq.${userId}`);
        if (!res.ok) throw new Error(await problem(res));
        const rows = (await res.json()) as { data: Partial<StoredData>; updated_at: string }[];
        if (!live) return;
        const row = rows[0];
        const local = dataRef.current;
        if (!row || isEmpty(row.data ?? {})) {
          settled.current = userId;
          await push();
        } else if (isEmpty(local)) {
          settled.current = userId;
          store.loadData(row.data);
          lastPushed.current = JSON.stringify(row.data);
          setLastSynced(row.updated_at ?? null);
          setStatus('synced');
        } else {
          setConflict({ savedAt: row.updated_at ?? null, items: countItems(row.data), data: row.data });
          setStatus('conflict');
        }
      } catch (e: any) {
        if (!live) return;
        setError(e?.message ?? 'Could not reach your account.');
        setStatus('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [auth.status, userId, store.ready]);

  // Save a couple of seconds after the last change.
  useEffect(() => {
    if (!userId || !store.ready || settled.current !== userId) return;
    if (json === lastPushed.current || json === failedJson.current) return;
    const t = setTimeout(() => {
      push().catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [json, userId, store.ready, status, push]);

  const syncNow = useCallback(async () => {
    if (!userId) return;
    if (settled.current !== userId) {
      if (!conflict) setStatus('checking');
      return;
    }
    failedJson.current = '';
    await push();
  }, [push, userId, conflict]);

  const keepCloudCopy = useCallback(() => {
    if (!conflict || !userId) return;
    settled.current = userId;
    store.loadData(conflict.data);
    lastPushed.current = JSON.stringify(conflict.data);
    setLastSynced(conflict.savedAt);
    setConflict(null);
    setStatus('synced');
  }, [conflict, userId, store]);

  const keepThisDevice = useCallback(async () => {
    if (!userId) return;
    settled.current = userId;
    setConflict(null);
    await push();
  }, [push, userId]);

  const value = useMemo<Cloud>(
    () => ({ status, lastSynced, error, conflict, syncNow, keepCloudCopy, keepThisDevice }),
    [status, lastSynced, error, conflict, syncNow, keepCloudCopy, keepThisDevice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): Cloud {
  const v = useContext(Ctx);
  if (!v) throw new Error('CloudProvider missing');
  return v;
}
