// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Eye, EyeOff, Mail, Lock, Globe, ChevronDown, X, Users,
  ShieldCheck, Zap, Brain,
  FileSpreadsheet, CalendarClock, TrendingUp, Boxes, Database,
  BarChart3, Upload, FileCheck,
  Box, Ruler, Layers,
  PenTool, FolderOpen, ClipboardList,
  Sun, Moon, Monitor,
} from 'lucide-react';
import { Button, Input, Logo, LogoWithText, CountryFlag } from '@/shared/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBrandingStore } from '@/stores/useBrandingStore';
import { BrandingEditorModal } from '@/app/layout/CustomBranding';
import { extractErrorMessageFromBody } from '@/shared/lib/api';
import { isTauri } from '@/shared/lib/desktop';
import { HEX_PORTRAIT_ASPECT, HEX_PORTRAIT_CLIP } from '@/shared/lib/honeycomb';
import { APP_VERSION } from '@/shared/lib/version';
import { loginFailureKindFromResponse } from './loginError';
import { AuthBackground } from './AuthBackground';
import {
  shouldAttemptDesktopBootstrap,
  shouldQueryFirstRun,
  type FirstRunStatus,
} from './desktopBootstrap';
import { safeNextPath } from './nextPath';
import { SUPPORTED_LANGUAGES } from '@/app/i18n';
import { useThemeStore } from '@/stores/useThemeStore';

/* Segmented theme switch (Light / Dark / System) for the login page. */
function ThemeSwitch() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const opts = [
    { mode: 'light' as const, icon: Sun, label: t('theme.light', { defaultValue: 'Light' }) },
    { mode: 'dark' as const, icon: Moon, label: t('theme.dark', { defaultValue: 'Dark' }) },
    { mode: 'system' as const, icon: Monitor, label: t('theme.system', { defaultValue: 'System' }) },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label', { defaultValue: 'Theme' })}
      className="flex items-center gap-0.5 rounded-xl border border-border-light bg-surface-elevated/85 backdrop-blur-sm p-0.5 shadow-sm"
    >
      {opts.map(({ mode, icon: Icon, label }) => {
        const active = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            aria-label={label}
            onClick={() => setTheme(mode)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-oe-blue text-white shadow-sm'
                : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-secondary'
            }`}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);
  // White-label brand (same localStorage store the in-app sidebar editor
  // writes to). When a tenant has set a logo / company name we show it
  // on the login card instead of the default OpenConstructionERP wordmark.
  const { mode: brandMode, logoDataUrl: brandLogo, companyName: brandName } =
    useBrandingStore();
  // Pull the workspace brand from the server so an invited user sees it on this
  // very first (pre-auth) screen, not just the browser that set it (issue #272).
  // Public endpoint, best-effort: the card paints instantly from localStorage
  // and this reconciles to whatever the workspace admin saved.
  useEffect(() => {
    void useBrandingStore.getState().hydrateFromServer();
  }, []);
  // `?next=/path` lets guarded routes send the user back to where they wanted
  // to go after login. Falls back to `/` for direct visits. Shared with the
  // authenticated-route guard (AuthedHome) so a redirect race between the two
  // cannot silently drop the `next` (the demo deep-link bug).
  const nextPath = safeNextPath(location.search);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem('oe_remember') === '1',
  );
  const [langOpen, setLangOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  // The demo sign-in is shown by DEFAULT and only hidden when the server
  // explicitly reports demo is off (SEED_DEMO=false, or an admin turned it off
  // in Settings). Starting true means a probe that fails or races the ~60s
  // first-boot demo seeding can never leave the block hidden (see the effect
  // below). This is deliberate: demo access is a headline feature of the open
  // platform, so it should always be there on a fresh install.
  const [demoEnabled, setDemoEnabled] = useState<boolean>(true);
  const langRef = useRef<HTMLDivElement>(null);

  // Desktop first-run: when running inside the Tauri shell with no stored
  // token and no deliberate manual logout this session, we silently auto-sign
  // in to the local workspace owner. Seed the pending flag synchronously so the
  // very first paint shows "Preparing your workspace..." rather than flashing
  // the login form before the bootstrap effect runs.
  const [bootstrapping, setBootstrapping] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored =
      localStorage.getItem('oe_access_token') || sessionStorage.getItem('oe_access_token');
    const manual = sessionStorage.getItem('oe_manual_login');
    return shouldQueryFirstRun(isTauri, Boolean(stored), manual);
  });

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0]!;

  // Clear form on mount (prevents pre-fill after logout)
  useEffect(() => {
    setEmail('');
    setPassword('');
    setError('');
  }, []);

  // Probe whether this server has demo turned OFF (public, no auth). The block
  // is shown by default (see the state above); this effect only ever HIDES it,
  // and only when the server explicitly reports `demo_enabled: false` - a
  // production install with SEED_DEMO=false, or an admin who turned demo off in
  // Settings. Older servers omit the field, which keeps the block shown. The
  // very first probe on a fresh install can race the ~60s demo seeding, so a
  // failed probe is retried a few times and NEVER hides the block on its own.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const probe = async (): Promise<void> => {
      attempts += 1;
      try {
        const res = await fetch('/api/v1/auth/first-run', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`first-run probe HTTP ${res.status}`);
        const status = (await res.json()) as FirstRunStatus;
        if (!cancelled) setDemoEnabled(status.demo_enabled !== false);
      } catch {
        // Transient failure (server still booting / seeding). Retry, but leave
        // the optimistic default in place so demo never vanishes on a hiccup.
        if (!cancelled && attempts < 6) {
          window.setTimeout(() => void probe(), 1500);
        }
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  // Desktop auto-bootstrap. Runs once on mount. On ANY failure it silently
  // falls back to the normal login form (clears `bootstrapping`); it never
  // surfaces an error to the user because manual login is always a valid path.
  useEffect(() => {
    if (!bootstrapping) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/v1/auth/first-run', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('first-run probe failed');
        const status = (await res.json()) as FirstRunStatus;

        const manual = sessionStorage.getItem('oe_manual_login');
        if (!shouldAttemptDesktopBootstrap(status, false, manual)) {
          throw new Error('bootstrap not applicable');
        }

        const bootRes = await fetch('/api/v1/auth/desktop-bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!bootRes.ok) throw new Error('desktop bootstrap failed');
        const data = (await bootRes.json()) as {
          access_token?: string;
          refresh_token?: string;
          user?: { email?: string };
        };
        if (!data.access_token || !data.refresh_token) {
          throw new Error('bootstrap response missing tokens');
        }
        if (cancelled) return;

        // Persist through the existing auth store path with remember=true so the
        // desktop owner stays signed in across launches.
        setTokens(data.access_token, data.refresh_token, true, data.user?.email);
        navigate(status.onboarding_completed === true ? '/dashboard' : '/onboarding', {
          replace: true,
        });
      } catch {
        // Silent fallback to the manual login form.
        if (!cancelled) setBootstrapping(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Mount-only: the gate inputs are read fresh inside `run`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // OIDC configuration (fetched once on mount)
  const [oidcConfig, setOidcConfig] = useState<{
    enabled: boolean;
    issuer_url: string;
    client_id: string;
    scopes: string;
  } | null>(null);
  useEffect(() => {
    fetch('/api/v1/users/auth/oidc/config/')
      .then((r) => r.json())
      .then((d) => setOidcConfig(d))
      .catch(() => setOidcConfig(null));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/users/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        // A proxy answering 502 for a backend that is down is a response, not
        // a network error, so the catch below never sees it. Without this the
        // outage lands on the credentials wording and the person is told the
        // one thing we know is untrue: nothing read their password. A 4xx
        // carrying no message we can read is that same outage told by whatever
        // stands in front of us, so the body decides alongside the status.
        const data = await res.json().catch(() => null);
        const parsed = extractErrorMessageFromBody(data);
        if (loginFailureKindFromResponse(res.status, parsed) === 'unavailable') {
          setError(
            t('auth.server_unavailable', {
              defaultValue:
                'The server did not answer, so your details were never checked. Try again in a moment.',
            }),
          );
          return;
        }
        setError(parsed || t('auth.invalid_credentials', 'Invalid email or password'));
        return;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token, rememberMe, email);
      navigate(nextPath, { replace: true });
    } catch {
      setError(t('auth.connection_error', 'Unable to connect to server. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Mirrors the seeded demo accounts in backend/app/main.py::_seed_demo_account:
  // every email here has to be one that seeder creates, and each name has to
  // match that account's full_name. The admin tile shows the role word instead
  // of the seeded person on purpose - that is what a first-time visitor scans
  // for. No password is listed on purpose either: the seeder generates a fresh
  // random one per install, so any literal printed here would be wrong on every
  // install. The tiles sign in through /auth/demo-login/ instead.
  const demoAccounts = [
    { email: 'demo@openconstructionerp.com', name: 'Muthukumar Panchabekasan', role: 'Administrator', color: 'bg-blue-500', letter: 'M' },
    { email: 'manager@openconstructionerp.com', name: 'Project manager', role: 'Manager', color: 'bg-[#7cd0ff]', letter: 'P' },
  ];

  const handleDemoLogin = async (demoEmail: string) => {
    setDemoLoading(demoEmail);
    setError('');
    setEmail('');
    setPassword('');
    try {
      // Password-less demo sign-in for the seeded showcase accounts. The
      // backend seeder generates a fresh random password per install (BUG-D01)
      // that the frontend cannot read, so this dedicated endpoint mints tokens
      // from the demo email alone. When demo seeding is disabled the server
      // returns 404 and we surface that message - we never fall back to
      // registering the account, so a demo click cannot create one in
      // production. The demo block is also hidden entirely in that config.
      const res = await fetch('/api/v1/users/auth/demo-login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const parsed = extractErrorMessageFromBody(data);
        setError(parsed || t('auth.demo_login_failed', 'Demo login failed. Please try again.'));
        return;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token, false, demoEmail);
      navigate(nextPath, { replace: true });
    } catch {
      setError(t('auth.connection_error', 'Unable to connect to server. Please try again.'));
    } finally {
      setDemoLoading(null);
    }
  };

  /* Benefits list - reserved for future hero section layout
  const benefits = [
    { icon: HardDrive, color: 'text-emerald-500 bg-emerald-500/10', title: t('login.benefit.local', 'Your data stays on your computer'), desc: t('login.benefit.local_desc', 'No cloud. No third-party servers. Full control.') },
    { icon: ShieldCheck, color: 'text-blue-500 bg-blue-500/10', title: t('login.benefit.open_source', '100% open source'), desc: t('login.benefit.open_source_desc', 'Transparent code. No vendor lock-in.') },
    { icon: Globe2, color: 'text-violet-500 bg-violet-500/10', title: t('login.benefit.standards', 'International standards'), desc: t('login.benefit.standards_desc', '120,000+ cost items across 9 cost bases worldwide.') },
    { icon: Brain, color: 'text-amber-500 bg-amber-500/10', title: t('login.benefit.ai', 'AI-assisted estimation'), desc: t('login.benefit.ai_desc', 'Smart suggestions. You decide, AI assists.') },
    { icon: Zap, color: 'text-rose-500 bg-rose-500/10', title: t('login.benefit.allinone', 'BOQ + 4D + 5D + Tendering'), desc: t('login.benefit.allinone_desc', 'Full workflow in one tool.') },
    { icon: Users, color: 'text-cyan-500 bg-cyan-500/10', title: t('login.benefit.free', 'Free for everyone'), desc: t('login.benefit.free_desc', 'No fees. No limits. By estimators.') },
  ]; */

  // Desktop first-run: clean centered pending state while we silently sign in
  // to the local workspace. Falls back to the form on any failure (see effect).
  if (bootstrapping) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center bg-surface-secondary overflow-hidden">
        <AuthBackground />
        <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
          <Logo size="lg" animate />
          <svg
            className="h-7 w-7 animate-spin text-oe-blue"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm font-medium text-content-secondary">
            {t('auth.preparing_workspace', { defaultValue: 'Preparing your workspace...' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4 py-16 sm:px-6">
      {/* Theme + Language - small, top right. */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <ThemeSwitch />
        <div className="relative" ref={langRef}>
        <button
          type="button"
          onClick={() => setLangOpen(!langOpen)}
          aria-label={t('common.language', { defaultValue: 'Language' })}
          className="flex h-9 items-center gap-2 rounded-xl border border-border-light bg-surface-elevated px-3 text-sm font-medium text-content-secondary hover:border-oe-blue/30 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue"
        >
          <Globe size={15} className="text-content-tertiary" />
          <CountryFlag code={currentLang.country} size={18} />
          <span className="hidden sm:inline">{currentLang.name}</span>
          <ChevronDown size={14} className={`text-content-tertiary transition-transform ${langOpen ? 'rotate-180' : ''}`} />
        </button>
        {langOpen && (
          <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-border-light bg-surface-elevated shadow-xl py-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isActive = i18n.language === lang.code;
              const english = 'english' in lang ? (lang as { english?: string }).english : undefined;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${isActive ? 'bg-oe-blue/10 text-oe-blue font-medium' : 'text-content-primary hover:bg-surface-secondary'}`}
                >
                  <CountryFlag code={lang.country} size={18} />
                  <span className="truncate">
                    {lang.name}
                    {english && (
                      <span className="ml-1 text-2xs text-content-tertiary">({english})</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* DM Constructions: one centred card. */}
      <main className="w-full max-w-[460px]">
        <div className="rounded-2xl border border-border-light bg-surface-elevated px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          {/* Logo on a white badge so a dark wordmark stays readable in dark mode. */}
          <div className="flex justify-center">
            {brandMode === 'logo' && brandLogo ? (
              <span className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/5">
                <img
                  src={brandLogo}
                  alt={brandName || 'Decision Minds'}
                  className="block h-10 w-auto max-w-[240px] object-contain"
                  draggable={false}
                />
              </span>
            ) : (
              <span className="text-sm font-semibold uppercase tracking-wider text-content-secondary">
                {brandMode === 'text' && brandName ? brandName : 'DM Constructions'}
              </span>
            )}
          </div>

          <h1 className="mt-6 text-center text-3xl font-bold tracking-tight text-content-primary">
            DM Constructions
          </h1>
          <p className="mt-2 text-center text-[15px] leading-relaxed text-content-secondary">
            Construction ERP with agentic workflows, customised for your projects.
          </p>

          {demoEnabled && (
            <div className="mt-8">
              <button
                type="button"
                data-testid="dmc-enter-demo"
                onClick={() => handleDemoLogin('demo@openconstructionerp.com')}
                disabled={demoLoading !== null}
                className="w-full rounded-xl bg-oe-blue px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-oe-blue-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
              >
                {demoLoading === 'demo@openconstructionerp.com' ? 'Opening demo...' : 'Enter demo'}
              </button>
              <p className="mt-2 text-center text-xs text-content-secondary">
                Signs you in as Muthukumar Panchabekasan · Administrator
              </p>
            </div>
          )}

          {error && !formOpen && (
            <div
              data-testid="login-error"
              className="mt-4 flex items-start gap-2 rounded-lg bg-semantic-error-bg px-3 py-2 text-xs text-semantic-error"
            >
              <span className="shrink-0 mt-0.5">!</span><span>{error}</span>
            </div>
          )}

          <div className="mt-6 border-t border-border-light pt-5">
            <button
              type="button"
              data-testid="dmc-toggle-signin"
              onClick={() => setFormOpen((v) => !v)}
              aria-expanded={formOpen}
              aria-controls="dmc-signin-panel"
              className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-oe-blue hover:text-oe-blue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue"
            >
              Sign in with your account
              <ChevronDown size={15} className={`transition-transform ${formOpen ? 'rotate-180' : ''}`} />
            </button>

            {formOpen && (
              <div id="dmc-signin-panel" className="mt-5">
                <form onSubmit={handleSubmit} className="space-y-3" aria-label={t('auth.login', 'Sign in')}>
                  <Input id="login-email" name="email" label={t('auth.email', 'Email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required aria-required="true" autoFocus icon={<Mail size={15} />} />

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-password" className="text-sm font-medium text-content-primary">{t('auth.password', 'Password')}</label>
                      <Link to="/forgot-password" className="text-xs font-medium text-oe-blue hover:text-oe-blue-hover transition-colors">{t('auth.forgot_password', 'Forgot password?')}</Link>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-content-tertiary"><Lock size={15} /></div>
                      <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.password_placeholder', 'Enter your password')} autoComplete="current-password" required aria-required="true" minLength={8} className="h-9 w-full rounded-lg border border-border bg-surface-primary pl-9 pr-9 text-sm text-content-primary placeholder:text-content-tertiary transition-all duration-fast ease-oe focus:outline-none focus:ring-2 focus:ring-oe-blue focus:border-transparent hover:border-content-tertiary" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('auth.hide_password', 'Hide password') : t('auth.show_password', 'Show password')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-content-tertiary hover:text-content-secondary transition-colors" tabIndex={-1}>
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3.5 w-3.5 rounded border-border text-oe-blue focus:ring-oe-blue accent-oe-blue" />
                    <span className="text-xs text-content-secondary">{t('auth.remember_me', 'Remember me for 30 days')}</span>
                  </label>

                  {error && (
                    <div
                      data-testid="login-error"
                      className="flex items-start gap-2 rounded-lg bg-semantic-error-bg px-3 py-2 text-xs text-semantic-error"
                    >
                      <span className="shrink-0 mt-0.5">!</span><span>{error}</span>
                    </div>
                  )}

                  <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">{t('auth.login', 'Sign in')}</Button>
                </form>

                {/* OIDC / SSO login - shown when the server has OIDC enabled */}
                {oidcConfig?.enabled && (
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      icon={<ShieldCheck size={16} />}
                      onClick={() => {
                        const params = new URLSearchParams({
                          client_id: oidcConfig.client_id,
                          response_type: 'code',
                          scope: oidcConfig.scopes,
                          redirect_uri: `${window.location.origin}/auth/oidc/callback`,
                        });
                        window.location.href = `${oidcConfig.issuer_url}/protocol/openid-connect/auth?${params}`;
                      }}
                    >
                      {t('auth.sso_login', { defaultValue: 'Sign in with SSO' })}
                    </Button>
                  </div>
                )}

                {/* Other demo roles */}
                {demoEnabled && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-medium text-content-secondary">Other demo roles</p>
                    <div className="space-y-1.5">
                      {demoAccounts.filter((a) => a.role !== 'Administrator').map((acct) => (
                        <button
                          key={acct.email}
                          type="button"
                          onClick={() => handleDemoLogin(acct.email)}
                          disabled={demoLoading !== null}
                          className="flex w-full items-center gap-3 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-2.5 text-left transition-colors hover:border-oe-blue/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue"
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${acct.color} text-white text-sm font-bold`}>
                            {acct.letter}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-content-primary">{demoLoading === acct.email ? 'Opening...' : acct.name}</span>
                            <span className="block truncate text-[11px] text-content-secondary">{acct.role}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <ul className="mx-auto mt-6 max-w-[420px] space-y-2 px-2 text-[13px] leading-relaxed text-content-secondary">
          {[
            'Estimate, plan and control project costs: BOQ, takeoff, scheduling and procurement.',
            'Agentic workflows with approval steps, set up around how your teams work.',
            'Integrations with Tally, WhatsApp and your CRM, delivered as part of your rollout.',
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-oe-blue/70" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <footer className="mt-8 text-center text-xs text-content-tertiary">
          <p>
            A Decision Minds solution <span aria-hidden>&middot;</span>{' '}
            <a href="https://github.com/decisionm/dm-constructions" target="_blank" rel="noopener noreferrer" className="rounded underline-offset-2 hover:text-content-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue">Licence &amp; source</a>
          </p>
          <p className="mt-1 font-mono tabular-nums">v{APP_VERSION}</p>
        </footer>
      </main>

      {/* ── White-label branding editor (pre-auth) ── */}
      {brandOpen && <BrandingEditorModal onClose={() => setBrandOpen(false)} />}

      {/* ── About modal ── */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-lg" onClick={() => setShowInfo(false)} />

          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border-light bg-surface-elevated shadow-2xl">
            <button aria-label={t('common.close', { defaultValue: 'Close' })}
              onClick={() => setShowInfo(false)}
              className="sticky top-0 float-right m-3 p-1.5 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-secondary transition-colors z-10 bg-surface-elevated/80 backdrop-blur-sm"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-border-light clear-both">
              <LogoWithText size="sm" className="mb-3" />
              <h3 className="text-base font-bold text-content-primary mb-2">
                {t('about.title', 'Professional construction cost estimation - free and open source')}
              </h3>
              <p className="text-[13px] text-content-secondary leading-relaxed">
                {t('about.intro', 'OpenConstructionERP is a modern platform for construction cost management. It covers the full estimation workflow - from creating a bill of quantities to tendering and bid comparison. Designed for professionals worldwide, it supports international standards and works in 24 languages.')}
              </p>
              <p className="mt-2 text-[13px] text-content-secondary leading-relaxed">
                {t('about.intro2', 'Unlike traditional commercial solutions, OpenConstructionERP runs entirely on your computer. Your project data never leaves your machine - you have full ownership and control. The source code is open and auditable, so you always know exactly what the software does.')}
              </p>
            </div>

            {/* What you can do */}
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-content-primary mb-3">
                {t('about.capabilities_title', 'What you can do')}
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: FileSpreadsheet, color: 'text-emerald-500 bg-emerald-500/10', title: t('about.cap.boq', 'Bill of Quantities'), desc: t('about.cap.boq_desc', 'Create detailed BOQ with hierarchical sections, positions, assemblies, markups (overhead, profit, VAT), and automatic totals. Works with regional classification systems or your own custom schema.') },
                  { icon: Database, color: 'text-blue-500 bg-blue-500/10', title: t('about.cap.costs', 'Cost Databases'), desc: t('about.cap.costs_desc', '55,000+ cost items across 48 regional databases worldwide. Add your own rates, import from Excel, or build a custom database from scratch.') },
                  { icon: CalendarClock, color: 'text-amber-500 bg-amber-500/10', title: t('about.cap.schedule', '4D Scheduling'), desc: t('about.cap.schedule_desc', 'Create project schedules with CPM critical path calculation, interactive Gantt charts, Monte Carlo risk analysis, resource assignment, and auto-generation of activities from your BOQ.') },
                  { icon: TrendingUp, color: 'text-violet-500 bg-violet-500/10', title: t('about.cap.costmodel', '5D Cost Model'), desc: t('about.cap.costmodel_desc', 'Track budgets over time with Earned Value Management (SPI, CPI), S-curve visualization, cash flow projections, cost snapshots, and what-if scenario modeling for informed decision-making.') },
                  { icon: Boxes, color: 'text-rose-500 bg-rose-500/10', title: t('about.cap.catalog', 'Resource Catalog'), desc: t('about.cap.catalog_desc', '7,000+ resources - materials, equipment, labor, operators, and utilities. Build reusable assemblies (composite rates) from catalog items and apply them directly to BOQ positions.') },
                  { icon: BarChart3, color: 'text-cyan-500 bg-cyan-500/10', title: t('about.cap.tendering', 'Tendering & Bids'), desc: t('about.cap.tendering_desc', 'Create tender packages with scope and positions, distribute to subcontractors, collect and compare bids side-by-side in a price mirror, and make award decisions based on data.') },
                  { icon: Upload, color: 'text-orange-500 bg-orange-500/10', title: t('about.cap.import', 'Import & Export'), desc: t('about.cap.import_desc', 'Full support for GAEB XML (X83), Excel, and CSV import/export. Generate professional PDF reports. Seamlessly integrate with your existing tools and workflows.') },
                  { icon: FileCheck, color: 'text-teal-500 bg-teal-500/10', title: t('about.cap.validation', 'Quality Validation'), desc: t('about.cap.validation_desc', 'Built-in quality engine automatically checks for missing quantities, zero prices, duplicate positions, classification compliance, and rate anomalies - with a traffic-light dashboard.') },
                ].map((cap, idx) => {
                  const Icon = cap.icon;
                  return (
                    <div key={idx} className="rounded-lg border border-border-light/60 bg-surface-secondary/50 px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${cap.color}`}>
                          <Icon size={13} />
                        </div>
                        <span className="text-xs font-semibold text-content-primary">{cap.title}</span>
                      </div>
                      <p className="text-2xs text-content-tertiary leading-relaxed pl-8">{cap.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Why open source */}
            <div className="px-6 py-4 border-t border-border-light">
              <h3 className="text-sm font-semibold text-content-primary mb-2">
                {t('about.why_title', 'Why open source matters')}
              </h3>
              <div className="space-y-2 text-[13px] text-content-secondary leading-relaxed">
                <p>{t('about.why_1', 'Construction cost data is one of the most valuable assets a company owns. With proprietary software, your data is often locked inside formats you cannot control. If the vendor raises prices, changes terms, or discontinues the product - you may lose access to years of work.')}</p>
                <p>{t('about.why_2', 'OpenConstructionERP takes a different approach. Your data is stored in open formats (SQLite, JSON, CSV) on your own hardware. You can export everything at any time. The source code is publicly auditable under AGPL-3.0, so there are no hidden data transfers, no telemetry, and no surprises.')}</p>
                <p>{t('about.why_3', 'The platform is modular - install only what you need. Community modules extend functionality without bloating the core. And because it runs locally, it works offline and performs fast even with large projects.')}</p>
              </div>
            </div>

            {/* Who is it for */}
            <div className="px-6 py-4 border-t border-border-light">
              <h3 className="text-sm font-semibold text-content-primary mb-2">
                {t('about.who_title', 'Who is it for')}
              </h3>
              <p className="text-[13px] text-content-secondary leading-relaxed mb-3">
                {t('about.who_desc', 'OpenConstructionERP is designed for anyone involved in construction cost management - whether you work on residential projects or large-scale infrastructure, in-house or as a consultant.')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  t('about.who.estimators', 'Cost estimators'),
                  t('about.who.qsurveyor', 'Quantity surveyors'),
                  t('about.who.pm', 'Project managers'),
                  t('about.who.contractors', 'General contractors'),
                  t('about.who.subs', 'Subcontractors'),
                  t('about.who.architects', 'Architects & engineers'),
                  t('about.who.developers', 'Real estate developers'),
                  t('about.who.public', 'Public sector & municipalities'),
                  t('about.who.students', 'Students & educators'),
                  t('about.who.freelancers', 'Freelance consultants'),
                ].map((role) => (
                  <span key={role} className="inline-flex items-center rounded-full bg-oe-blue/10 px-2.5 py-1 text-2xs font-medium text-oe-blue">
                    {role}
                  </span>
                ))}
              </div>
            </div>

            {/* Key facts */}
            <div className="px-6 py-4 border-t border-border-light">
              <h3 className="text-sm font-semibold text-content-primary mb-3">
                {t('about.numbers_title', 'Platform in numbers')}
              </h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { value: '120,441', label: t('about.stat.costs', 'Cost items') },
                  { value: '48', label: t('about.stat.regions', 'Regional databases') },
                  { value: String(SUPPORTED_LANGUAGES.length), label: t('about.stat.languages', 'Languages') },
                  { value: '100%', label: t('about.stat.free', 'Free & open source') },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-surface-secondary/50 py-2.5">
                    <div className="text-lg font-bold text-oe-blue">{stat.value}</div>
                    <div className="text-2xs text-content-tertiary">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI note */}
            <div className="px-6 py-4 border-t border-border-light">
              <h3 className="text-sm font-semibold text-content-primary mb-2">
                {t('about.ai_title', 'About AI features')}
              </h3>
              <p className="text-[13px] text-content-secondary leading-relaxed">
                {t('about.ai_desc', 'OpenConstructionERP includes optional AI-powered tools - quick estimation from text descriptions, smart cost suggestions, and BOQ chat assistant. These features require an API key from a provider of your choice (Anthropic, OpenAI, Google). AI is always opt-in: it only activates when you configure it, and you decide what data to send. Without an API key, all other features work fully offline.')}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border-light flex items-center justify-between">
              <div className="flex items-center gap-3 text-2xs text-content-quaternary">
                <a href="/api/source" target="_blank" rel="noopener noreferrer" className="hover:text-content-secondary transition-colors">AGPL-3.0</a>
                <a href="https://OpenConstructionERP.com" target="_blank" rel="noopener noreferrer" className="hover:text-content-secondary transition-colors">OpenConstructionERP.com</a>
                <a href="https://github.com/datadrivenconstruction/OpenConstructionERP" target="_blank" rel="noopener noreferrer" className="hover:text-content-secondary transition-colors">GitHub</a>
              </div>
              <Button variant="primary" size="sm" onClick={() => setShowInfo(false)}>
                {t('about.close', 'Got it')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
