'use client';
// header + footer กลาง (แปลงจาก js/layout.js) — เขียนเป็น JSX แทนการต่อ string ใส่ innerHTML
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '../lib/api';
import { getMe } from '../lib/auth-guard';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/search', key: 'nav.search' },
  { href: '/team', key: 'nav.team' },
];
const CUSTOMER_NAV = [{ href: '/profile', key: 'nav.profile' }];
const ADMIN_NAV = [
  { href: '/admin/products', key: 'nav.adminProducts' },
  { href: '/admin/users', key: 'nav.adminUsers' },
];

const IconSun = () => (
  <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
);
const IconMoon = () => (
  <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z" />
  </svg>
);

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  // undefined = มี token แต่ยังรอ API, null = ยังไม่ล็อกอิน, object = ผู้ใช้
  const [me, setMe] = useState(undefined);

  useEffect(() => {
    if (!auth.getToken()) return setMe(null);
    getMe().then(setMe);
  }, []);

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const menu = [...NAV, ...(me ? CUSTOMER_NAV : []), ...(me?.is_admin ? ADMIN_NAV : [])];
  const themeLabel = t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark');

  function logout() {
    auth.clear();
    window.location.href = '/';
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/">Maison de Relic</Link>
        <nav className="nav" aria-label={t('nav.label')}>
          {menu.map(({ href, key }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <div className="lang-switch" role="group" aria-label={t('lang.label')}>
            {['th', 'en'].map((code) => (
              <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn theme-toggle" aria-label={themeLabel} title={themeLabel}
                  onClick={(e) => toggle(e.currentTarget)}>
            <IconSun />
            <IconMoon />
          </button>
          {me === null ? (
            <>
              <Link className="btn btn-ghost btn-pill" href="/login">{t('auth.signIn')}</Link>
              <Link className="btn btn-solid btn-pill" href="/register">{t('auth.signUp')}</Link>
            </>
          ) : (
            <>
              {me && <span className="header-user">{t('auth.greeting', { name: me.display_name })}</span>}
              {me && !me.is_email_verified && (
                <Link className="btn btn-solid btn-pill" href="/verify-email">{t('auth.verifyEmail')}</Link>
              )}
              <button type="button" className="btn btn-ghost btn-pill" onClick={logout}>{t('auth.logout')}</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container">
        <p>© {new Date().getFullYear()} Maison de Relic · {t('footer.text')}</p>
      </div>
    </footer>
  );
}
