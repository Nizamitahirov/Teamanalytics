// Əsas dil (SPEC §12.4). Açarlar tip-təhlükəsizdir: en.ts eyni açarları məcburi saxlamalıdır.
export const az = {
  'app.name': 'Workforce Planning',
  'app.dept': 'Əmək Münasibətləri',
  'app.skip': 'Əsas məzmuna keç',

  'nav.dashboard': 'Panel',
  'nav.employees': 'Əməkdaşlar',
  'nav.tasks': 'Tapşırıqlar',
  'nav.scenarios': 'Ssenarilər',
  'nav.optimization': 'Optimizasiya',
  'nav.reports': 'Hesabatlar',
  'nav.health': 'Data sağlamlığı',
  'nav.log': 'Jurnal',
  'nav.settings': 'Ayarlar',
  'nav.more': 'Daha çox',
  'nav.main': 'Əsas menyu',
  'nav.collapse': 'Menyunu daralt',
  'nav.expand': 'Menyunu genişləndir',

  'page.dashboard': 'İş yükü və ştat planlaması',
  'page.notFound': 'Səhifə tapılmadı',

  'top.search': 'Axtarış',
  'top.undo': 'Geri al',
  'top.redo': 'İrəli al',
  'top.notifications': 'Bildirişlər',
  'top.theme': 'Mövzu',
  'top.soon': 'Növbəti mərhələlərdə',

  'theme.light': 'Açıq',
  'theme.dark': 'Tünd',
  'theme.system': 'Sistem',

  'role.admin': 'Administrator',
  'role.editor': 'Redaktor',
  'role.viewer': 'Baxış',

  'sync.preview': 'v2 önizləmə',
  'auth.logout': 'Çıxış',

  'login.title1': 'Xoş',
  'login.title2': 'gəlmisiniz',
  'login.sub': 'Davam etmək üçün adınızı və parolunuzu daxil edin.',
  'login.username': 'İstifadəçi adı',
  'login.password': 'Parol',
  'login.show': 'Göstər',
  'login.hide': 'Gizlət',
  'login.showPassword': 'Parolu göstər',
  'login.hidePassword': 'Parolu gizlət',
  'login.submit': 'Daxil ol',
  'login.busy': 'Yoxlanılır…',
  'login.caps': 'Caps Lock aktivdir',
  'login.foot': 'Giriş məlumatlarını sistem administratorundan alın.',
  'login.error': 'Ad və ya parol yanlışdır',
  'login.network': 'Serverə qoşulmaq alınmadı. İnterneti yoxlayıb yenidən cəhd edin.',
  'login.language': 'Dil',

  'state.loading': 'Yüklənir…',
  'state.error': 'Xəta baş verdi',
  'state.retry': 'Yenidən cəhd et',

  'placeholder.title': 'Bu bölmə hazırlanır',
  'placeholder.body': 'v2-də bu bölmə hazırlanır (plan: mərhələ {phase}). Hazırda işləyən versiyadan istifadə edin.',
  'placeholder.openV1': 'İşləyən versiyanı aç',
  'notFound.body': 'Axtardığınız səhifə yoxdur və ya köçürülüb.',
  'notFound.home': 'Panelə qayıt',
} as const;

export type MessageKey = keyof typeof az;
export type Dict = Record<MessageKey, string>;
