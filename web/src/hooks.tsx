import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { api, sessionStore, setOnUnauthorized } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (e: string, p: string) => Promise<void>;
  verifyToken: (email: string, token: string, type?: 'signup' | 'email') => Promise<void>;
  updateUser: (p: Partial<User>) => Promise<User>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = () => { sessionStore.set(null); setUser(null); };
  useEffect(() => {
    setOnUnauthorized(() => setUser(null));
    if (sessionStore.get()) api.me().then(setUser).catch(() => {}).finally(() => setLoading(false));
    else setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const { session, user } = await api.login(email, password);
    sessionStore.set(session);
    if (user) {
      setUser(user);
    } else {
      const me = await api.me();
      setUser(me);
    }
  };

  const verifyToken = async (email: string, token: string, type: 'signup' | 'email' = 'signup') => {
    const { session, user } = await api.verifyToken(email, token, type);
    sessionStore.set(session);
    if (user) {
      setUser(user);
    } else {
      const me = await api.me();
      setUser(me);
    }
  };

  const updateUser = async (p: Partial<User>) => {
    const updated = await api.updateMe(p);
    setUser(updated);
    return updated;
  };

  return <Ctx.Provider value={{ user, loading, login, verifyToken, updateUser, logout }}>{children}</Ctx.Provider>;
}

/**
 * Data hook: loads on mount, polls every `pollMs` (REST default), and refetches instantly on
 * optional Socket.io events if VITE_SOCKET_URL is configured.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = [], opts: { pollMs?: number; events?: string[]; stopWhen?: (d: T) => boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const run = async () => {
      try {
        const d = await fetcher();
        if (!alive) return;
        setData(d); setError(null);
        if (opts.pollMs && !(opts.stopWhen?.(d))) timer = window.setTimeout(run, opts.pollMs);
      } catch (e) { if (alive) setError((e as Error).message); }
      finally { if (alive) setLoading(false); }
    };
    run();
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    const url = import.meta.env.VITE_SOCKET_URL;
    const token = sessionStore.get()?.access_token;
    if (!url || !token || !opts.events?.length) return;
    const s = io(url, { auth: { token } });
    opts.events.forEach((e) => s.on(e, reload));
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, error, loading, reload };
}
