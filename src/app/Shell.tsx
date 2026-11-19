import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  Bell,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Search,
  Sun,
  Undo2,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { IconButton } from '../components/Button';
import { useI18n } from '../lib/i18n';
import { storage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import { NAV, navByPath } from './nav';
import { useAuth } from './auth';
import type { MeResponse } from '../../shared/schema';
import s from './Shell.module.css';

const COLLAPSE_KEY = 'wfp.v2.sideCollapsed';

/** Tətbiqin qabığı: sol menyu (≥ 1024 px) / aşağı naviqasiya, üst panel, məzmun (SPEC §5). */
export function Shell({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const { theme, cycle } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => storage.get(COLLAPSE_KEY) === '1');
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const current = navByPath(location.pathname);
  const title = current ? t(current.title ?? current.label) : t('page.notFound');

  useEffect(() => {
    document.title = `${title} — ${t('app.name')}`;
  }, [title, t]);

  // Marşrut dəyişəndə "daha çox" vərəqi bağlanır
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      storage.set(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const soon = t('top.soon');
  const initial = me.user.name.charAt(0).toUpperCase();

  const link = (n: (typeof NAV)[number]) => (
    <NavLink key={n.path} to={n.path} end={n.path === '/'} className={s.link} title={collapsed ? t(n.label) : undefined}>
      <n.icon size={18} aria-hidden="true" />
      <span className={s.label}>{t(n.label)}</span>
    </NavLink>
  );

  return (
    <div className={`${s.shell} ${collapsed ? s.collapsed : ''}`}>
      <a className="skip-link" href="#main">
        {t('app.skip')}
      </a>

      <aside className={s.side}>
        <div className={s.logo}>
          <BrandMark size={40} />
          <div className={s.logoText}>
            <b>Workforce</b>
            <small>{t('app.dept')}</small>
          </div>
        </div>
        <nav className={s.nav} aria-label={t('nav.main')}>
          {NAV.filter((n) => n.group === 'main').map(link)}
          <div className={s.sep} role="separator" />
          {NAV.filter((n) => n.group === 'system').map(link)}
        </nav>
        <div className={s.sideFoot}>
          <div className={s.pill} role="status" title={t('sync.preview')}>
            <i aria-hidden="true" />
            <span>{t('sync.preview')}</span>
          </div>
          <div className={s.user}>
            <div className={s.avatar} aria-hidden="true">
              {initial}
            </div>
            <div className={s.userText}>
              <b>{me.user.name}</b>
              <small>{t(`role.${me.user.role}`)}</small>
            </div>
            <button type="button" className={s.sideBtn} onClick={logout} aria-label={t('auth.logout')} title={t('auth.logout')}>
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className={`${s.sideBtn} ${s.collapseBtn}`}
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.titleBox}>
            <ol className={`${s.crumbs} ${s.hideXs}`} aria-label="Breadcrumb">
              <li>{t('app.name')}</li>
              {current && current.path !== '/' && <li>{t(current.label)}</li>}
            </ol>
            <h1 className={s.title}>{title}</h1>
          </div>
          <div className={s.actions}>
            <button
              type="button"
              className={s.search}
              aria-disabled="true"
              title={soon}
              aria-label={`${t('top.search')} — ${soon}`}
            >
              <Search size={16} aria-hidden="true" />
              <span>{t('top.search')}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <IconButton label={`${t('top.undo')} — ${soon}`} aria-disabled="true" className={s.hideSm}>
              <Undo2 size={18} aria-hidden="true" />
            </IconButton>
            <IconButton label={`${t('top.redo')} — ${soon}`} aria-disabled="true" className={s.hideSm}>
              <Redo2 size={18} aria-hidden="true" />
            </IconButton>
            <IconButton label={`${t('top.notifications')} — ${soon}`} aria-disabled="true">
              <Bell size={18} aria-hidden="true" />
            </IconButton>
            <IconButton label={`${t('top.theme')}: ${t(`theme.${theme}`)}`} onClick={cycle}>
              <ThemeIcon size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className={s.content}>
          <Outlet />
        </main>
      </div>

      <nav className={s.bottom} aria-label={t('nav.main')}>
        {NAV.filter((n) => n.primary).map((n) => (
          <NavLink key={n.path} to={n.path} end={n.path === '/'}>
            <n.icon size={20} aria-hidden="true" />
            <span>{t(n.label)}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}>
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>{t('nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className={s.sheetBackdrop} onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className={s.sheet} role="dialog" aria-modal="true" aria-label={t('nav.more')}>
            <h2>{t('nav.more')}</h2>
            {NAV.filter((n) => !n.primary).map(link)}
            <button
              type="button"
              className={s.link}
              onClick={logout}
              style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <LogOut size={18} aria-hidden="true" />
              <span>{t('auth.logout')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
