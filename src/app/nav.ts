import {
  LayoutDashboard,
  Users,
  ListChecks,
  FlaskConical,
  Zap,
  FileBarChart,
  ShieldCheck,
  History,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '../../shared/i18n/az';

export type NavItem = {
  path: string;
  label: MessageKey;
  title?: MessageKey;
  icon: LucideIcon;
  /** Bölmənin hazır olacağı mərhələ (SPEC §16) — yer tutan səhifədə göstərilir. */
  phase: number;
  /** Mobil aşağı naviqasiyada birbaşa görünür (< 1024 px). */
  primary?: boolean;
  group: 'main' | 'system';
};

// SPEC §5: Panel · Əməkdaşlar · Tapşırıqlar · Ssenarilər · Optimizasiya · Hesabatlar — ayırıcı — Data sağlamlığı · Jurnal · Ayarlar
export const NAV: NavItem[] = [
  { path: '/', label: 'nav.dashboard', title: 'page.dashboard', icon: LayoutDashboard, phase: 4, primary: true, group: 'main' },
  { path: '/employees', label: 'nav.employees', icon: Users, phase: 3, primary: true, group: 'main' },
  { path: '/tasks', label: 'nav.tasks', icon: ListChecks, phase: 3, primary: true, group: 'main' },
  { path: '/scenarios', label: 'nav.scenarios', icon: FlaskConical, phase: 6, primary: true, group: 'main' },
  { path: '/optimization', label: 'nav.optimization', icon: Zap, phase: 7, group: 'main' },
  { path: '/reports', label: 'nav.reports', icon: FileBarChart, phase: 8, group: 'main' },
  { path: '/health', label: 'nav.health', icon: ShieldCheck, phase: 7, group: 'system' },
  { path: '/log', label: 'nav.log', icon: History, phase: 3, group: 'system' },
  { path: '/settings', label: 'nav.settings', icon: SlidersHorizontal, phase: 5, group: 'system' },
];

export const navByPath = (pathname: string) =>
  NAV.find((n) => (n.path === '/' ? pathname === '/' : pathname === n.path || pathname.startsWith(n.path + '/')));
