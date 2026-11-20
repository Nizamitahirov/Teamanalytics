# CLAUDE.md — Workforce Planning (Əmək Münasibətləri)

Bu fayl Claude Code üçün layihənin işçi təlimatıdır. Hər sessiyada əvvəlcə bunu, sonra lazım olduqda `docs/CONTEXT.md` (tarixçə, qərarlar, data mənşəyi) və `SPEC.md` (v2 hədəfi) oxu.

## 1. Layihə nədir

Bank qrupunun **Əmək Münasibətləri şöbəsi** üçün iş yükü və ştat planlaması (workforce planning) platforması.
Şöbənin bütün təkrarlanan işləri (tapşırıqları) — kim edir, ildə neçə dəfə, neçə saat aparır — bir yerdə saxlanır; rəhbər işləri əməkdaşlar arasında ötürür, ləğv edir, yükü normaya (2026: **1922 saat/il/ştat**) görə izləyir və rəhbərliyə vizual hesabat təqdim edir.

- **Canlı sayt:** https://teamanalytics.vercel.app (Vercel, `main` branch-dan avtomatik deploy)
- **Repo:** `Nizamitahirov/Teamanalytics` (public)
- **Baza:** Firebase Firestore, layihə `worforce-74ddf`, baza `(default)`
- **Giriş:** ilk istifadəçi `Ecosystem` / `Ecosystem` (Firestore `users` kolleksiyası; Ayarlar → İstifadəçilər)
- **İstifadəçi dili:** Azərbaycan dili. Bütün UI mətnləri, xəta mesajları, jurnal qeydləri, commit mesajları azərbaycanca. Kod identifikatorları ingiliscə.
- **Sahib:** Nizami Tahirov. Texniki olmayan istifadəçidir: ondan addım tələb edən hər şey (Vercel, Firebase konsolu) minimuma endirilməli və addım-addım izah edilməlidir.

## 2. Stack və qovluq xəritəsi

Keçid dövrü (SPEC §15): **canlı sayt hələ v1 klientidir** (`public/`, build-siz), server isə Mərhələ 1-dən TypeScript-dədir. v2 klienti (React + Vite) paralel qurulur və Mərhələ 10-a qədər deploy olunmur.
Vercel: `public/` statik (v1), `api/*.ts` Node serverless funksiya (Vercel TS-i özü kompilyasiya edir). `vercel.json`-da `framework: null` və heç nə qurmayan `buildCommand` — Vite build-i canlıya təsir etmir.

```
public/                 v1 klienti (dəyişməz; Mərhələ 10-da legacy/ olacaq)
  index.html login.html app.js styles.css vendor/
api/                    Vercel funksiyaları (TS, ince adapterlər) — login, logout, me, data, ops, log, users, health
server/                 Server məntiqi (Vercel-dən asılı deyil, testlənir)
  firestore.ts          Firestore REST klienti; upsert = updateMask, `_v` increment, tranzaksiya + resolveVersions (ziddiyyət)
  auth.ts               PBKDF2 parol, HMAC imzalı sessiya cookie-si
  http.ts               requireUser, send/sendError ({error, code}), parseBody (Zod), fail
shared/                 Həm server, həm klient
  constants.ts          Sabitlər (Zod-suz — klient bundle-ı üçün)
  schema.ts             Zod: Task, Employee, LogEntry, Settings, Role, Op (+ v, base), OpsBody, Conflict, OpsResponse
  model.ts              normalizeTask/Employee, curOwner, statusOf, diffOps (yalnız dəyişən sahələr + v/base)
  metrics.ts            SPEC §7 formulaları — TƏK MƏNBƏ (Panel və hesabatlar buradan); filterScope
  dashboard.ts          Panel vidjetlərinin datası (bullet, Sankey, treemap, heatmap, waterfall, Pareto, histogram, ştat cədvəli)
  search.ts             Axtarış normallaşdırması (ə/e, ı/i, ö/o, ü/u, ş/s, ç/c, ğ/g)
  taskFilter.ts         Tapşırıq filtrləri və sürətli çiplər (saf funksiya)
  format.ts             Rəqəm formatı (minlik U+202F, onluq vergül) — Intl istifadə olunmur (ADR-002)
  i18n/az.ts en.ts      Mətnlər (tip-təhlükəsiz açarlar)
  version.ts            APP_VERSION (/api/health, UI)
src/                    v2 React klienti (Vite, React 19, React Router, CSS Modules, Lucide)
  app/                  router, Shell (sol menyu / aşağı naviqasiya, üst panel), auth konteksti, nav
  store/                dataStore (Zustand+immer: commit/undo/redo/pull/flush/ziddiyyət), actions (ötür/ləğv/düzəliş/birləşdir), persist (IndexedDB), useSyncLoop
  features/             auth, dashboard, tasks (cədvəl, panel, ötürmə/ləğv dialoqları), employees (siyahı, profil, dialoq), log, palette (Ctrl+K, qısayollar), sync, placeholder
  components/           Button, IconButton, Modal, Drawer, Toaster, EmployeePicker (combobox), Badges, Form.module.css, EmptyState, Skeleton
  charts/               ECharts (modul, SVG renderer), theme.ts (açıq/tünd), options/*.ts (saf: data → option + cədvəl + xülasə), ChartFrame
  hooks/                useFocusTrap, useMedia, useMetrics
  lib/                  api klienti, i18n, mövzu (açıq/tünd/sistem), storage
  styles/               tokens.css (SPEC §12.1), base.css, fonts.css (Inter latin + latin-ext)
index.html vite.config.ts   v2 giriş nöqtəsi; publicDir = static/ (v1 public/ DEYİL)
data/seed.json          İlkin data: 341 tapşırıq + 23 əməkdaş (ictimai deyil, yalnız serverdə oxunur)
dev/mock-firestore.ts   Firestore REST mock (yaddaşda) — dev server və server testləri üçün
dev/mock-server.ts      Lokal server: Vercel emulyasiyası (public/ + api/*.ts) + mock Firestore
dev/e2e/                v2 Playwright testləri (TS); vizual etalonlar *-snapshots/ (yeniləmək: --update-snapshots)
dev/e2e.py              v1 Playwright testi (Python) — v1 klienti TS serverə qarşı
tests/golden/           Qızıl rəqəmlər (SPEC §13.2) — v1 formulalarının TS köçürməsi; HEÇ VAXT silinmir
tests/server/ tests/unit/   API (mock Firestore ilə), buildWrites, Zod, i18n
docs/                   CONTEXT.md (tarixçə), ADR-*.md (qərarlar)
SPEC.md                 v2 spesifikasiyası
```

## 3. Əmrlər

```bash
npm run dev        # http://localhost:8765 — v1 klienti + TS API, mock Firestore (giriş: Ecosystem / Ecosystem)
                   # http://localhost:8791 — mock bazanın JSON görüntüsü + API çağırış siyahısı; POST /reset — bazanı sıfırla
npm run dev:v2     # http://localhost:5173 — v2 klienti (Vite); /api → 8765 (npm run dev ayrıca işləməlidir)
npm run typecheck  # tsc: server (tsconfig.json, NodeNext) + klient (tsconfig.app.json) + testlər (tsconfig.test.json)
npm run lint       # ESLint (typescript-eslint, react-hooks, jsx-a11y); public/ istisnadır
npm run format     # Prettier (format:check — CI)
npm test           # Vitest: qızıl testlər, server (mock Firestore), unit
npm run build      # v2 Vite build → dist/ (deploy olunmur)
npm run e2e        # v2 Playwright (dev serverləri özü işə salır)
npm run e2e:v1     # v1 testi (npm run dev işləyərkən; pip install playwright openpyxl)
                   # XLSX_PATH=/path/xlsx.full.min.js — CDN əlçatmazdırsa Excel testi üçün
npm run ci         # typecheck + lint + format + test + build
```

- e2e testləri **təmiz mock baza** gözləyir: hər qaçışdan əvvəl `npm run dev`-i yenidən başlat.
- Mock server real Firebase-ə qoşulmur: `FIRESTORE_API_BASE` və `FIRESTORE_FAKE_TOKEN` ilə `server/firestore.ts`-i öz mock-una yönəldir.
- Sandbox/CI mühitində çox vaxt `*.googleapis.com` bağlıdır — real Firebase-i yalnız canlı saytda (`/api/health`, brauzer) yoxlamaq olar.
- Versiyalar dəqiq pin olunub (`^` yox). TypeScript 6.x (typescript-eslint hələ TS 7-ni dəstəkləmir), ESLint 9.x (jsx-a11y hələ 10-u dəstəkləmir) — `docs/ADR-001-foundation.md`.

## 4. Mühit dəyişənləri (Vercel)

| Ad | Məcburi | Təyinat |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **bəli** | Service account JSON-un bütün məzmunu. Ad hərf/boşluq fərqinə dözümlüdür; `_JSON`, `_KEY` variantları və base64 da qəbul olunur (`lib/firestore.js → findServiceAccountVar`). |
| `FIRESTORE_DATABASE` | yox | Baza ID-si `(default)` deyilsə |
| `AUTH_SECRET` | yox | Sessiya HMAC açarı; yoxdursa service account açarından törədilir (SHA-256) |

Hal-hazırda Vercel-də yalnız `FIREBASE_SERVICE_ACCOUNT` var. **Açarı heç vaxt repo-ya yazma** (repo public-dir; Google sızan açarları avtomatik bloklayır). Dəyişən əlavə/dəyişdirildikdən sonra **Redeploy** lazımdır. Problem olduqda əvvəlcə `https://teamanalytics.vercel.app/api/health`-ə bax.

## 5. Məlumat modeli

### Firestore kolleksiyaları

| Kolleksiya | Sənəd ID | Sahələr |
|---|---|---|
| `tasks` | `id` (məs. `B-25`, `P-17`, `T-…`) | `id, company, process, category, task, description, owner_before, owner_after, min_per_key, annual_freq, unit, hours, after_opt, is_cancelled, updated_at, updated_by` + sistem: `_ts`, `_deleted`, `_v` |
| `employees` | `name` (dəqiq ad, məs. `Şöbə əməkdaşları`) | `name, company, activity, fte, is_group, active` + `_ts`, `_deleted`, `_v` |
| `log` | klientin yaratdığı `L-…` id | `ts, user, action, task_id, task_label, from, to, comment` + `_ts` |
| `meta/main` | tək sənəd | `updated` (son commit vaxtı), `norm`, `warn` (ayarlar) |
| `users` | ad kiçik hərflə (`ecosystem`) | `name, salt, hash, iter, active, created_by` — **heç vaxt klientə göndərilmir** |

- `_ts`: hər yazmada server vaxtı (`REQUEST_TIME` transform). Delta sinxronun əsası.
- `_v`: versiya — hər yazmada server `increment` ilə artırır (v1 yazmaları da); v2 klienti ziddiyyəti bununla aşkarlayır (ADR-002). `_v`-siz köhnə sənəd = 0.
- `_deleted: true`: yumşaq silmə (tombstone). Tam yükləmədə filtrlənir, deltada klientə "sil" siqnalı kimi gedir. Tombstone-lar heç vaxt təmizlənmir (bilinən texniki borc).
- ID prefiksləri: `B-` Birbank (ilkin cədvəl 1), `P-` Pashapay (ilkin cədvəl 2), `T-` platformada yaradılan.

### Biznes qaydaları (dəyişmə — rəhbərliyə təqdim olunan rəqəmlər bunlara əsaslanır)

- **Cari icraçı** = `owner_after || owner_before`.
- **Status** (`statusOf`): `is_cancelled` → `Ləğv`; `owner_before` boş, `owner_after` dolu → `Yeni`; ikisi dolu və fərqli → `Transfer`; qalan → `Mövcud`.
- **Ötürmə**: `owner_before` ilkin sahib kimi saxlanır (boşdursa cari sahib yazılır), `owner_after = yeni`. Yəni `owner_before` "baza bölgüsü"dür, ötürmə zənciri saxlanmır (yalnız jurnalda).
- **Ləğv** silmək deyil: `is_cancelled = true`, istənilən vaxt bərpa olunur. Ləğv olunmuş saatlar "Ləğvdən qənaət"dir.
- **Fəaliyyət forması** əməkdaşın profilindən gəlir (tapşırıqdan yox): `Administrativ` və ya `Project and AdHoc based`. İlkin qayda: Ağaəli, Aygül, İqrar, Aysel → Project and AdHoc based.
- **Yük** = cari icraçının aktiv (ləğv olunmamış) tapşırıqlarının `hours` cəmi ÷ (`norm` × `fte`). Səviyyələr: `> 100%` norma aşılır (qırmızı), `> warn%` yüksək (sarı, default 85), `0` tapşırıq yoxdur, qalan normal (yaşıl).
- **Lazım olan ştat (FTE)** = aktiv saat cəmi ÷ `norm`. **Mövcud ştat** = aktiv tapşırığı olan, qrup olmayan əməkdaşların `fte` cəmi.
- **Qrup** (`is_group`, məs. "Şöbə əməkdaşları"): saatları cəmə daxildir, fərdi yük və mövcud ştat hesabına düşmür.
- **Optimizasiya**: `after_opt` (saat) doludursa, "Optimizasiyadan sonra" rejimində `hours` əvəzinə istifadə olunur; potensial = `hours − after_opt`.
- `hours` ilin cəmidir; mənbə cədvəlində `min_per_key × annual_freq / 60` ilə hesablanıb (formada avtomatik doldurulur, amma `hours` əl ilə də dəyişə bilər).

## 6. Sinxronizasiya axını (vacib — dəyişməzdən əvvəl başa düş)

Aşağıdakı v1 axınıdır (`public/app.js`). v2 klienti (`src/store/dataStore.ts`) eyni modeli saxlayır, fərqləri: IndexedDB keşi (`wfp.v2`, növbə daxil — offline dəyişikliklər itmir), diff yalnız dəyişən sahələri `v` + `base` ilə göndərir, server tranzaksiyada versiyanı yoxlayır (fərqli sahələr → səssiz birləşdirmə, eyni sahə → ziddiyyət dialoqu), redo var. Ətraflı: `docs/ADR-002-data-layer.md`.

1. **Açılış:** `localStorage['wfp.cache.v2']` = `{me, lastTs, state}` dərhal render olunur, sonra `/api/data?since=lastTs`.
2. **Dəyişiklik** (`commit(label, mutator, logs)`): snapshot → mutator lokal state-i dəyişir → render → `diffOps(prev, state)` yalnız dəyişən sənədlər üçün `upsert`/`delete` əməliyyatları yaradır → növbəyə (`queue`) → `flush()` ardıcıl `POST /api/ops` (1 təkrar cəhd, uğursuzluqda tam yenidən yükləmə).
3. **Server** (`applyOps` → `buildWrites`): Zod ilə yoxlanır (yanlış op → 400, heç nə yazılmır), hamısı bir `:commit` (≤450 yazma/hissə) + `meta/main.updated` yenilənir. Upsert `updateMask` ilə **yalnız göndərilən sahələri** yazır.
4. **Yoxlama:** hər 10 s (səhifə görünəndə, modal bağlıyken) `GET /api/data?since=lastTs` → server `meta/main`-i oxuyur (1 oxuma); `updated === since` → `{unchanged}`; deyilsə `_ts > since` sorğuları → `{delta}`. Klient növbəsi boş deyilsə serverdən gələni **tətbiq etmir** və `lastTs`-i dəyişmir.
5. **Undo:** son 30 snapshot; geri alma da yeni diff kimi göndərilir və jurnala "Geri alma" yazılır (jurnal geri alınmır).
6. **Jurnal** qeydləri klientdə `id` alır → deltada təkrarlanmanın qarşısı alınır.

Qadağalar:
- Bütün kolleksiyanı üzərinə yazan ("replace all") yazma əlavə etmə — eyni vaxtda işləyən başqa istifadəçinin dəyişikliyini silir (v1-də belə bir bug tapılıb düzəldilib, `docs/CONTEXT.md`).
- Brauzerdən Firestore-a birbaşa qoşulma əlavə etmə (qaydalar "hamıya bağlı"dır, Firebase Auth yoxdur) — bütün giriş `api/` üzərindən.
- Gündəlik pulsuz limit: 50 000 oxuma / 20 000 yazma. Tam yükləmə ~670 oxumadır; yoxlama 1 oxuma. Yeni xüsusiyyət hər sorğuda kolleksiya oxumamalıdır.

## 7. Təhlükəsizlik

- Sessiya: `wfp_session` HttpOnly, Secure, SameSite=Lax cookie, 12 saat, HMAC-SHA256. İstifadəçi silinsə də cari sessiya müddəti bitənə qədər qalır (texniki borc).
- Parol: PBKDF2-SHA256, 100 000 iterasiya, 16 bayt salt. `Ecosystem` istifadəçisinin yalnız heşi kodda var (`BOOTSTRAP`), `users` kolleksiyası boş olanda ilk girişdə yaradılır.
- Login: IP başına 10 yanlış cəhd / 10 dəq (funksiya instansiyasının yaddaşında — tam qoruma deyil).
- Bütün HTML render `esc()`-dən keçir. Yeni render kodu da keçməlidir (data istifadəçi tərəfindən daxil edilir).
- Repo public-dir: sirr, şəxsi məlumat, real parol commit etmə.

## 8. Dizayn sistemi

- Tünd göy (`--ink #090A13`, jabr.az ilhamı) + Birbank qırmızı→narıncı qradiyent (`--grad: #E30613 → #F23A1C → #FF6B17 → #FF9524`). Açıq fon `#F4F4F7`, kartlar ağ, radius 16px.
- Şrift Inter (lokal), ikonlar Font Awesome solid (lokal). CDN-dən yalnız SheetJS (Excel) yüklənir, o da lazım olanda.
- Qrafik rəngləri: status (yaxşı `#0ca30c`, xəbərdarlıq `#fab219`, kritik `#d03b3b`) yalnız yük vəziyyəti üçün; "Əvvəl" boz `#A3A7B7`, "İndi"/tək seriya `#F2501E`; şirkət rəngi varlığa bağlıdır (Birbank `#E30613`, Pashapay `#2347A8`), sıraya yox.
- Responsive: ≤1300 px əlavə sütunlar gizlənir (`.hide-md`), ≤900 px sol menyu aşağı naviqasiyaya çevrilir, ≤700 px cədvəllər karta çevrilir (`table.resp` + `c-*` sinifləri).

## 9. İş qaydaları

- Sahib `main`-ə birbaşa push etməyə icazə verib ("merge etməyim"). Kiçik və yoxlanmış dəyişikliklər → birbaşa `main`. Böyük/riskli işlər (məs. SPEC v2 miqrasiyası) → branch + PR, sonra sahibdən soruş.
- Hər push-dan sonra Vercel ~1 dəq ərzində deploy edir; `GET /api/health` → `commit` sahəsi yeni SHA-nı göstərməlidir.
- Dəyişiklikdən əvvəl: `npm run ci`; məntiq dəyişibsə `npm run e2e` + `npm run e2e:v1`. UI dəyişibsə 1440, 820 və 390 px enində ekran şəkli ilə bax (`dev/e2e-shots/`).
- Rəhbərliyə gedən rəqəmlərin hesablanma qaydasını (bölmə 5) sahibin razılığı olmadan dəyişmə.
- Commit mesajları azərbaycanca; sonunda layihənin standart `Co-Authored-By` sətri.

## 10. Bilinən problemlər / texniki borc

- `app.js` tək fayl, `innerHTML` ilə tam yenidən render; hər dəyişiklikdə bütün aktiv bölmə yenidən çəkilir (341 sətirdə problem deyil, 5 000+ sətirdə yavaşlayacaq).
- Rəqəm formatı (v1) `toLocaleString('az-AZ')` — bəzi brauzerlərdə `27,850` kimi görünür (v2-də düzəldilib, ADR-002).
- Vizual etalonlar Linux Chromium-da çəkilib; başqa platformada fərqlənə bilər.
- Tombstone-lar və jurnal sonsuz böyüyür; arxivləmə yoxdur.
- ~~`applyOps` upsert-də tam sənədi əvəz edir~~ — **Mərhələ 1-də düzəldilib** (`updateMask`, SPEC §15.3; test: `tests/server/api.test.ts`).
- Rollar yoxdur: hər istifadəçi hər şeyi edə, istifadəçi silə bilər.
- Tarixi snapshot yoxdur → trend qrafikləri mümkün deyil.
- Data keyfiyyəti: ad dublikatları (Farida/Fəridə, Kamila/Kamilə), təkrar sətir (`B-1770271295121` = `B-44`), id-siz sətir (`P-x71`), `P-29`-da saat uyğunsuzluğu — ətraflı `docs/CONTEXT.md`.
- Bütün bunlar `SPEC.md`-də həll olunur.
