import type { Dict } from './az.js';

// İkinci dil (SPEC §12.4). Data dəyərləri (proses adları) tərcümə olunmur.
export const en: Dict = {
  'app.name': 'Workforce Planning',
  'app.dept': 'Labour Relations',
  'app.skip': 'Skip to main content',

  'nav.dashboard': 'Dashboard',
  'nav.employees': 'Employees',
  'nav.tasks': 'Tasks',
  'nav.scenarios': 'Scenarios',
  'nav.optimization': 'Optimization',
  'nav.reports': 'Reports',
  'nav.health': 'Data health',
  'nav.log': 'Activity log',
  'nav.settings': 'Settings',
  'nav.more': 'More',
  'nav.main': 'Main menu',
  'nav.collapse': 'Collapse menu',
  'nav.expand': 'Expand menu',

  'page.dashboard': 'Workload and headcount planning',
  'page.notFound': 'Page not found',

  'top.search': 'Search',
  'top.undo': 'Undo',
  'top.redo': 'Redo',
  'top.notifications': 'Notifications',
  'top.theme': 'Theme',
  'top.soon': 'Coming in later phases',

  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  'role.admin': 'Administrator',
  'role.editor': 'Editor',
  'role.viewer': 'Viewer',

  'sync.preview': 'v2 preview',
  'auth.logout': 'Sign out',

  'login.title1': 'Welcome',
  'login.title2': 'back',
  'login.sub': 'Enter your username and password to continue.',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.show': 'Show',
  'login.hide': 'Hide',
  'login.showPassword': 'Show password',
  'login.hidePassword': 'Hide password',
  'login.submit': 'Sign in',
  'login.busy': 'Checking…',
  'login.caps': 'Caps Lock is on',
  'login.foot': 'Ask your system administrator for credentials.',
  'login.error': 'Incorrect username or password',
  'login.network': 'Could not reach the server. Check your connection and try again.',
  'login.language': 'Language',

  'state.loading': 'Loading…',
  'state.error': 'Something went wrong',
  'state.retry': 'Try again',

  'placeholder.title': 'This section is in progress',
  'placeholder.body': 'In v2 this section arrives in phase {phase}. Please use the current version for now.',
  'placeholder.openV1': 'Open current version',
  'notFound.body': 'The page you are looking for does not exist or has moved.',
  'notFound.home': 'Back to dashboard',
};
