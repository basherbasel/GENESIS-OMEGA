import { t, type Language } from '../lib/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';

interface AuthState {
  authRequired: boolean;
  authenticated: boolean;
}

interface AuthGateProps {
  language: Language;
  children: React.ReactNode;
  /** Called once access is granted so the app can hydrate protected data. */
  onReady: () => void;
  onAuthChange?: (state: AuthState) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children, onReady, onAuthChange ,
  language,}) => {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

  const [checking, setChecking] = useState(true);
  const [state, setState] = useState<AuthState>({ authRequired: false, authenticated: true });
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const resp = await fetch('/api/auth/status');
        const data = (await resp.json()) as AuthState;
        if (!alive) return;
        setState({ authRequired: Boolean(data.authRequired), authenticated: Boolean(data.authenticated) });
      } catch {
        if (!alive) return;
        setError(tr('auth.serverError'));
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (checking) return;
    if (!state.authRequired || state.authenticated) {
      onReady();
      onAuthChange?.(state);
    }
  }, [checking, state, onReady, onAuthChange]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        });
        const data = (await resp.json()) as { ok?: boolean; error?: string };
        if (!resp.ok || !data.ok) {
          setError(data.error || tr('auth.loginError'));
          return;
        }
        setApiKey('');
        setState({ authRequired: true, authenticated: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : tr('auth.connectError'));
      } finally {
        setSubmitting(false);
      }
    },
    [apiKey],
  );

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setState({ authRequired: true, authenticated: false });
    }
  }, []);

  if (checking) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 animate-pulse text-cyan-400" aria-hidden="true" />
          {tr('auth.checking')}
        </div>
      </div>
    );
  }

  if (!state.authRequired || state.authenticated) {
    return (
      <>
        {children}
        {state.authRequired && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-300 hover:border-rose-500/50 hover:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            {tr('auth.logout')}
          </button>
        )}
      </>
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2">
            <LockKeyhole className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">{tr('auth.title')}</h1>
            <p className="text-[11px] text-slate-400">{tr('auth.enabled')}</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleLogin(e)} className="space-y-3">
          <label htmlFor="omega-api-key" className="block text-xs text-slate-300">
            {tr('auth.keyLabel')}
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden="true" />
            <input
              id="omega-api-key"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pr-9 pl-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              placeholder="OMEGA_API_KEY"
            />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !apiKey.trim()}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? tr('auth.verifying') : tr('auth.login')}
          </button>
        </form>

        <p className="text-[11px] leading-relaxed text-slate-500">
          {tr('auth.notePrefix')} <span dir="ltr">HttpOnly</span>{tr('auth.noteSuffix')}
        </p>
      </div>
    </div>
  );
};
