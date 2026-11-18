import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthConfig } from './server';

/**
 * Email + password accounts through Supabase Auth. The app talks to Supabase directly, so passwords
 * never pass through (or get stored by) PokéAsset's own server. Only the public project address and
 * public key come from /api/config.
 */

export type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string };
export type AuthResult = { ok: boolean; message?: string; needsConfirm?: boolean };
type Cfg = { url: string; anonKey: string };
type Status = 'loading' | 'off' | 'out' | 'in';

type Auth = {
  /** off = accounts are not set up on the server yet */
  status: Status;
  session: Session | null;
  /** set when the person opened a "reset password" email link */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  setNewPassword: (password: string) => Promise<AuthResult>;
  /** Call the account database as the signed-in person. */
  rest: (path: string, init?: RequestInit, anon?: boolean) => Promise<Response>;
  /** Upload a listing photo to the signed-in person's own folder. Returns its public address. */
  uploadPhoto: (base64: string, mime: string) => Promise<string>;
};

const Ctx = createContext<Auth | null>(null);
const KEY = 'pokeasset.auth';

async function gotrue(cfg: Cfg, path: string, body: unknown, token?: string, method = 'POST') {
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }
  return { res, json };
}

const messageOf = (j: any, status: number): string => {
  const m = String(j?.msg || j?.error_description || j?.message || j?.error || '');
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/password should be at least/i.test(m)) return m;
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
  return m || `Request failed (${status}).`;
};

function toSession(j: any): Session | null {
  if (!j?.access_token || !j?.refresh_token || !j?.user?.id) return null;
  const expiresAt = typeof j.expires_at === 'number' ? j.expires_at * 1000 : Date.now() + (j.expires_in ?? 3600) * 1000;
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt, userId: j.user.id, email: j.user.email ?? '' };
}

const NETWORK = 'Could not reach the account service. Check your connection and try again.';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const cfgRef = useRef<Cfg | null>(null);
  cfgRef.current = cfg;
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const keep = useCallback(async (s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
    setStatus(s ? 'in' : 'out');
    try {
      if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
      else await AsyncStorage.removeItem(KEY);
    } catch {
      // storage unavailable: the session just will not survive a reload
    }
  }, []);

  useEffect(() => {
    (async () => {
      let c: Cfg | null = null;
      try {
        const r = await getAuthConfig();
        if (r.enabled && r.url && r.anonKey) c = { url: r.url.replace(/\/$/, ''), anonKey: r.anonKey };
      } catch {
        // server unreachable: accounts stay off for this visit
      }
      setCfg(c);
      cfgRef.current = c;
      if (!c) {
        setStatus('off');
        return;
      }

      // Links from emails (confirm sign-up, reset password) come back to the site with the result in the address.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
        const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const type = p.get('type');
        const token = p.get('access_token');
        const refresh = p.get('refresh_token');
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {
          // ignore
        }
        if (token && type === 'recovery') {
          setRecoveryToken(token);
        } else if (token && refresh) {
          try {
            const { res, json } = await gotrue(c, 'user', undefined, token, 'GET');
            if (res.ok && json?.id) {
              const exp = Number(p.get('expires_in') || 3600);
              await keep({ accessToken: token, refreshToken: refresh, expiresAt: Date.now() + exp * 1000, userId: json.id, email: json.email ?? '' });
              return;
            }
          } catch {
            // fall through to the saved session
          }
        }
      }

      let saved: Session | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) saved = JSON.parse(raw) as Session;
      } catch {
        // ignore
      }
      if (saved?.refreshToken) {
        sessionRef.current = saved;
        setSession(saved);
        setStatus('in');
      } else {
        setStatus('out');
      }
    })();
  }, [keep]);

  /** A session whose access token is still valid, refreshed when it is about to expire. */
  const validSession = useCallback(async (): Promise<Session | null> => {
    const s = sessionRef.current;
    const c = cfgRef.current;
    if (!s || !c) return null;
    if (s.expiresAt - Date.now() > 60_000) return s;
    if (!refreshing.current) {
      refreshing.current = (async () => {
        try {
          const { res, json } = await gotrue(c, 'token?grant_type=refresh_token', { refresh_token: s.refreshToken });
          const next = res.ok ? toSession(json) : null;
          if (next) {
            await keep(next);
            return next;
          }
          if (res.status === 400 || res.status === 401 || res.status === 403) await keep(null);
          return null;
        } catch {
          return null; // offline: keep the session and try again later
        }
      })().finally(() => {
        refreshing.current = null;
      });
    }
    return refreshing.current;
  }, [keep]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const c = cfgRef.current;
      if (!c) return { ok: false, message: 'Accounts are not set up on this site yet.' };
      try {
        const { res, json } = await gotrue(c, 'token?grant_type=password', { email: email.trim(), password });
        const s = res.ok ? toSession(json) : null;
        if (!s) return { ok: false, message: messageOf(json, res.status) };
        await keep(s);
        return { ok: true };
      } catch {
        return { ok: false, message: NETWORK };
      }
    },
    [keep],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const c = cfgRef.current;
      if (!c) return { ok: false, message: 'Accounts are not set up on this site yet.' };
      try {
        const { res, json } = await gotrue(c, 'signup', { email: email.trim(), password });
        if (!res.ok) return { ok: false, message: messageOf(json, res.status) };
        const s = toSession(json);
        if (s) {
          await keep(s);
          return { ok: true };
        }
        return { ok: true, needsConfirm: true, message: 'Account created. Open the confirmation link we emailed you, then sign in.' };
      } catch {
        return { ok: false, message: NETWORK };
      }
    },
    [keep],
  );

  const signOut = useCallback(async () => {
    const c = cfgRef.current;
    const s = sessionRef.current;
    if (c && s) {
      try {
        await gotrue(c, 'logout', undefined, s.accessToken);
      } catch {
        // signing out locally is enough
      }
    }
    await keep(null);
  }, [keep]);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const c = cfgRef.current;
    if (!c) return { ok: false, message: 'Accounts are not set up on this site yet.' };
    if (!email.trim()) return { ok: false, message: 'Type your email first.' };
    try {
      const { res, json } = await gotrue(c, 'recover', { email: email.trim() });
      if (!res.ok) return { ok: false, message: messageOf(json, res.status) };
      return { ok: true, message: 'If that email has an account, a reset link is on its way.' };
    } catch {
      return { ok: false, message: NETWORK };
    }
  }, []);

  const setNewPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const c = cfgRef.current;
      if (!c || !recoveryToken) return { ok: false, message: 'This reset link has expired. Request a new one.' };
      try {
        const { res, json } = await gotrue(c, 'user', { password }, recoveryToken, 'PUT');
        if (!res.ok) return { ok: false, message: messageOf(json, res.status) };
        setRecoveryToken(null);
        return { ok: true, message: 'Password changed. Sign in with the new password.' };
      } catch {
        return { ok: false, message: NETWORK };
      }
    },
    [recoveryToken],
  );

  const rest = useCallback(
    async (path: string, init: RequestInit = {}, anon = false) => {
      const c = cfgRef.current;
      if (!c) throw new Error('Accounts are not set up on this site yet.');
      const s = await validSession();
      if (!s && !anon) throw new Error('Not signed in.');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      try {
        return await fetch(`${c.url}/rest/v1/${path}`, {
          ...init,
          signal: ctl.signal,
          headers: {
            'Content-Type': 'application/json',
            apikey: c.anonKey,
            Authorization: `Bearer ${s ? s.accessToken : c.anonKey}`,
            ...((init.headers as Record<string, string>) ?? {}),
          },
        });
      } catch {
        throw new Error('Could not reach the account service. Check your connection and try again.');
      } finally {
        clearTimeout(timer);
      }
    },
    [validSession],
  );

  const uploadPhoto = useCallback(
    async (base64: string, mime: string): Promise<string> => {
      const c = cfgRef.current;
      const s = await validSession();
      if (!c || !s) throw new Error('Sign in to upload photos.');
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const type = ext === 'jpg' ? 'image/jpeg' : mime;
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (bytes.length > 3 * 1024 * 1024) throw new Error('That photo is over 3 MB. Choose a smaller one.');
      const path = `${s.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const res = await fetch(`${c.url}/storage/v1/object/listing-photos/${path}`, {
        method: 'POST',
        headers: { apikey: c.anonKey, Authorization: `Bearer ${s.accessToken}`, 'Content-Type': type },
        body: bytes as any,
      });
      if (!res.ok) {
        let m = '';
        try {
          m = (await res.json())?.message ?? '';
        } catch {
          // ignore
        }
        throw new Error(/bucket not found/i.test(m) ? 'Photo storage is not set up. Run supabase/marketplace.sql.' : m || `Photo upload failed (${res.status}).`);
      }
      return `${c.url}/storage/v1/object/public/listing-photos/${path}`;
    },
    [validSession],
  );

  const value = useMemo<Auth>(
    () => ({ status, session, recovering: !!recoveryToken, signIn, signUp, signOut, resetPassword, setNewPassword, rest, uploadPhoto }),
    [status, session, recoveryToken, signIn, signUp, signOut, resetPassword, setNewPassword, rest, uploadPhoto],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}
