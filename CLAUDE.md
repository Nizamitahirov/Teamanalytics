# CLAUDE.md — Workforce Planning (Əmək Münasibətləri)

Bu fayl Claude Code üçün layihənin işçi təlimatıdır. Hər sessiyada əvvəlcə bunu, sonra lazım olduqda `docs/CONTEXT.md` (tarixçə, qərarlar, data mənşəyi) və `SPEC.md` (v2 hədəfi) oxu.

## 1. Layihə nədir

Bank qrupunun **Əmək Münasibətləri şöbəsi** üçün iş yükü və ştat planlaması (workforce planning) platforması.
Şöbənin bütün təkrarlanan işləri (tapşırıqları) — kim edir, ildə neçə dəfə, neçə saat aparır — bir yerdə saxlanır; rəhbər işləri əməkdaşlar arasında ötürür, ləğv edir, yükü normaya (2026: **1922 saat/il/ştat**) görə izləyir və rəhbərliyə vizual hesabat təqdim edir.

- **Canlı sayt:** https://teamanalytics.vercel.app — **v2** (Vercel, `main` branch-dan avtomatik deploy); köhnə v1 ehtiyat kimi `/legacy/` (ADR-010)
- **Repo:** `Nizamitahirov/Teamanalytics` (public)
- **Baza:** Firebase Firestore, layihə `worforce-74ddf`, baza `(default)`
- **Giriş:** ilk istifadəçi `Ecosystem` / `Ecosystem` (Firestore `users` kolleksiyası; Ayarlar → İstifadəçilər)
- **İstifadəçi dili:** Azərbaycan dili. Bütün UI mətnləri, xəta mesajları, jurnal qeydləri, commit mesajları azərbaycanca. Kod identifikatorları ingiliscə.
- **Sahib:** Nizami Tahirov. Texniki olmayan istifadəçidir: ondan addım tələb edən hər şey (Vercel, Firebase konsolu) minimuma endirilməli və addım-addım izah edilməlidir.

## 2. Stack və qovluq xəritəsi

**Canlı sayt v2-dir** (React + Vite, kökdə `/`); v1 (`public/`, build-siz) dəyişmədən `/legacy/` altında ehtiyat kimi qalır (ADR-010). Server Mərhələ 1-dən TypeScript-dədir və hər iki klientə xidmət edir.
Vercel: `buildCommand = npm run build:vercel` (v2 → `dist/`, `public/` → `dist/legacy/`), `outputDirectory = dist`, SPA rewrite (`/api`, `/assets`, `/legacy` xaric), `/login.html` → `/login` yönləndirməsi; `api/*.ts` Node serverless funksiya.

```
public/                 v1 klienti — canlıda /legacy/ (ehtiyat; yönləndirmələr nisbi)
  index.html login.html app.js styles.css vendor/
api/                    Vercel funksiyaları (TS, ince adapterlər) — login, logout, me, data, ops, log, users, health (+ klient xətaları), scenarios, notifications, snapshots (+ backup-lar), cron/daily — 12 (Hobby limiti, yenisini əlavə etmə)
server/                 Server məntiqi (Vercel-dən asılı deyil, testlənir)
  firestore.ts          Firestore REST klienti; upsert = updateMask, `_v` increment, tranzaksiya + resolveVersions (ziddiyyət)
  auth.ts               PBKDF2 parol, sessiya (__Host- cookie, sv), Firestore kilidi, parol siyasəti, rollar, ip_hash
  scenarios.ts          Ssenari əməliyyatları + təsdiq axını + bildirişlər (ADR-006)
  daily.ts              Gündəlik iş: snapshot + backup + təmizlik (ADR-011)
  http.ts               requireUser(minRole) — RBAC + CSRF + limit; send/sendError ({error, code}), parseBody (Zod)
  commonPasswords.ts    Ən çox yayılmış 1000 parol (generasiya olunub, mənbə faylda)
shared/                 Həm server, həm klient
  constants.ts          Sabitlər (Zod-suz — klient bundle-ı üçün)
  schema.ts             Zod: Task, Employee, LogEntry, Settings, Role, Op (+ v, base), OpsBody, Conflict, OpsResponse
  model.ts              normalizeTask/Employee, curOwner, statusOf, diffOps (yalnız dəyişən sahələr + v/base)
  apply.ts              Op-ların lokal tətbiqi, compileOps, resolveVersions (server də buradan), invertOps
  scenario.ts           Ssenari dəyişiklik qurucuları + scenarioImpact; scenarioDoc.ts — sənəd → Scenario
  rebalance.ts          SPEC §8 balanslama alqoritmi
  optimization.ts       Optimizasiya portfeli (§6.6); health.ts — Data sağlamlığı yoxlamaları (§6.8)
  snapshot.ts           Gündəlik snapshot (§7.10) — Panel ilə eyni formulalar
  report.ts             Hesabat datası + avtomatik şərh (§6.7); excel.ts — export vərəqləri, sütun xəritəsi, import diff (§9)
  metrics.ts            SPEC §7 formulaları — TƏK MƏNBƏ (Panel və hesabatlar buradan); filterScope
  dashboard.ts          Panel vidjetlərinin datası (bullet, Sankey, treemap, heatmap, waterfall, Pareto, histogram, ştat cədvəli)
  search.ts             Axtarış normallaşdırması (ə/e, ı/i, ö/o, ü/u, ş/s, ç/c, ğ/g)
  taskFilter.ts         Tapşırıq filtrləri və sürətli çiplər (saf funksiya)
  format.ts             Rəqəm formatı (minlik U+202F, onluq vergül) — Intl istifadə olunmur (ADR-002)
  i18n/az.ts en.ts      Mətnlər (tip-təhlükəsiz açarlar)
  version.ts            APP_VERSION (/api/health, UI)
src/                    v2 React klienti (Vite, React 19, React Router, CSS Modules, Lucide)
  app/                  router, Shell (sol menyu / aşağı naviqasiya, üst panel), auth konteksti, useCan (rol), nav
  store/                dataStore (Zustand+immer: commit/undo/redo/pull/flush/ziddiyyət), actions (ötür/ləğv/düzəliş/birləşdir), scenarioActions (ssenari: önizləmə/tətbiq/geri alma/təsdiq), persist (IndexedDB), useSyncLoop
  features/             auth (giriş, məcburi parol), settings (hesab, ümumi, istifadəçilər), dashboard, tasks (cədvəl, panel, ötürmə/ləğv dialoqları), employees (siyahı, profil, dialoq), scenarios (siyahı, redaktor, dəyişiklik/tətbiq dialoqları), notifications, optimization (Kanban), health (data sağlamlığı), reports (rəhbərlik/əməkdaş/proses/jurnal hesabatları, Excel export/import sehrbazı), log, palette (Ctrl+K, qısayollar), sync, placeholder
  components/           Button, IconButton, Modal, Drawer, Toaster, EmployeePicker (combobox), Badges, Form.module.css, EmptyState, Skeleton
  charts/               ECharts (modul, SVG renderer), theme.ts (açıq/tünd), options/*.ts (saf: data → option + cədvəl + xülasə), ChartFrame
  hooks/                useFocusTrap, useMedia, useMetrics
  lib/                  api klienti, i18n, mövzu (açıq/tünd/sistem), storage
  styles/               tokens.css (SPEC §12.1), base.css, fonts.css (Inter latin + latin-ext), print.css (A4 üfüqi, data-print-*)
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
npm run build      # v2 Vite build → dist/
npm run build:vercel # canlı build: v2 → dist/ + v1 → dist/legacy/ (Vercel bunu işlədir)
npm run e2e        # v2 Playwright (dev serverləri özü işə salır); CDN bağlıdırsa XLSX_PATH=… (Excel testləri)
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
| `CRON_SECRET` | yox | Gündəlik iş üçün (Vercel `Authorization: Bearer` göndərir); yoxdursa yalnız Vercel cron agenti qəbul olunur. Tövsiyə olunur |
| `AUTH_SECRET` | yox | Sessiya HMAC açarı və ip_hash duzu; yoxdursa service account açarından törədilir (SHA-256). Dəyişsə bütün sessiyalar bağlanır |

Hal-hazırda Vercel-də yalnız `FIREBASE_SERVICE_ACCOUNT` var. **Açarı heç vaxt repo-ya yazma** (repo public-dir; Google sızan açarları avtomatik bloklayır). Dəyişən əlavə/dəyişdirildikdən sonra **Redeploy** lazımdır. Problem olduqda əvvəlcə `https://teamanalytics.vercel.app/api/health`-ə bax.

## 5. Məlumat modeli

### Firestore kolleksiyaları

| Kolleksiya | Sənəd ID | Sahələr |
|---|---|---|
| `tasks` | `id` (məs. `B-25`, `P-17`, `T-…`) | `id, company, process, category, task, description, owner_before, owner_after, min_per_key, annual_freq, unit, hours, after_opt, is_cancelled, updated_at, updated_by` + v2: `automation, automation_note, due_quarter, opt_before, opt_done_at, health_ignore` + sistem: `_ts`, `_deleted`, `_v` |
| `employees` | `name` (dəqiq ad, məs. `Şöbə əməkdaşları`) | `name, company, activity, fte, is_group, active` + v2: `health_ignore` + `_ts`, `_deleted`, `_v` |
| `log` | klientin yaratdığı `L-…` id | `ts, user, action, task_id, task_label, from, to, comment, group` + `_ts` (`group` — ssenari id-si) |
| `meta/main` | tək sənəd | `updated` (son commit vaxtı), `norm`, `warn`, `vacation_days` (default 30), `approval` (0/1), `approval_hours` (ayarlar), `last_snapshot`, `last_backup` (cron; `updated`-i dəyişmir) |
| `scenarios` | `S-…` | `name, description, status (draft/pending/applied/archived), changes/summary/revert (JSON sətri), created_by/at, submitted_*, decided_*, decision_comment, applied_*, reverted_*` + `_ts`, `_deleted`, `_v` |
| `notifications` | `N-…` | `to, kind, text, link, read, ts` + `_ts` — yalnız sahibinə göndərilir |
| `snapshots` | `YYYY-MM-DD` (Bakı) | `date, data` (JSON: ümumi + şirkətlər üzrə KPI, yüklər) — trend, dövr müqayisəsi |
| `backups` | `YYYY-MM-DD` + `…~n` hissələr | meta: `date, parts, created, tasks, employees, size`; hissə: gzip+base64 `data`; 30 gün |
| `errors` | `E-…` | klient xətaları (`ts, user, message, stack, url, version, ua`), 30 gün |
| `users` | ad kiçik hərflə (`ecosystem`) | `name, salt, hash, iter, active, created_by, role, session_version, must_change_password, failed_attempts, locked_until, last_login` — heş/duz **heç vaxt klientə göndərilmir** |

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
- **Effektiv norma** = `norm − vacation_days × 8` (məzuniyyət, default 30 gün → 2026: 1922 − 240 = **1682**; sahibin qərarı, ADR-008). Aşağıdakı bütün bölmələrdə "norma" = effektiv norma; Paneldə izahı göstərilir.
- **Yük** = cari icraçının aktiv (ləğv olunmamış) tapşırıqlarının `hours` cəmi ÷ (effektiv norma × `fte`). Səviyyələr: `> 100%` norma aşılır (qırmızı), `> warn%` yüksək (sarı, default 85), `0` tapşırıq yoxdur, qalan normal (yaşıl).
- **Lazım olan ştat (FTE)** = aktiv saat cəmi ÷ effektiv norma. **Mövcud ştat** = aktiv tapşırığı olan, qrup olmayan əməkdaşların `fte` cəmi.
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

Ətraflı: `docs/ADR-005-security.md`.
- **Rollar** (SPEC §2): `admin` (hər şey, istifadəçilər, ayarlar), `editor` (`POST /api/ops`), `viewer` (yalnız oxuma). Server hər sorğuda yoxlayır (`requireUser(req, res, minRole)`); rol yoxdursa admin. Sonuncu aktiv admini silmək/endirmək qadağandır.
- **Sessiya:** `__Host-wfp_session` (Secure, HttpOnly, SameSite=Lax), HMAC-SHA256, 12 saat (və ya "Məni xatırla" 7 gün); `sv` ≠ `users.session_version` → 401 (parol dəyişmə, sıfırlama, ləğv, silmə). Köhnə `wfp_session` keçid dövründə qəbul olunur.
- **Parol:** PBKDF2-SHA256, 100 000 iterasiya; siyasət ≥ 10 simvol + 1000 yayılmış parol + ad. `Ecosystem` yalnız heş kimi kodda (`BOOTSTRAP`); ilkin parolla giriş → `mustChange` (v2 klienti məcbur edir; server keçid dövründə məcbur etmir — v1 sınmasın).
- **Kilid:** 5 yanlış cəhd → 15 dəq (Firestore, 423 + vaxt); IP limiti əlavə qat. Yanlış ad/parol eyni cavab.
- **CSRF:** POST-larda `Sec-Fetch-Site`/`Origin` yoxlanır. **Limit:** 300 sorğu/dəq/istifadəçi. **Audit:** jurnalda `ip_hash`.
- **Başlıqlar:** HSTS, Permissions-Policy, X-Frame-Options, nosniff, Referrer-Policy (vercel.json). Ciddi CSP: v2 build-ində meta + `vercel.json` HTTP başlığı (`frame-ancestors 'none'`), `/legacy/` xaric (inline skript); ikisi `tests/unit/csp.test.ts` ilə sinxron.
- v1-də bütün HTML render `esc()`-dən keçir; v2-də React escaping (heç vaxt `dangerouslySetInnerHTML`).
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
- Jurnal sonsuz böyüyür (arxivləmə yoxdur); tombstone-lar 90 gündən sonra cron ilə silinir (ADR-011).
- ~~`applyOps` upsert-də tam sənədi əvəz edir~~ — **Mərhələ 1-də düzəldilib** (`updateMask`, SPEC §15.3; test: `tests/server/api.test.ts`).
- Trend/dövr müqayisəsi gündəlik snapshot-lardan (ADR-011) — data cron işə düşdükcə yığılır.
- Data keyfiyyəti: ad dublikatları (Farida/Fəridə, Kamila/Kamilə), təkrar sətirlər (`B-1770271295121` = `B-44`, `B-222` = `B-30`, `B-224` = `B-32`), id-siz sətir (`P-x71`), `P-29`-da saat uyğunsuzluğu — ətraflı `docs/CONTEXT.md`; v2-də `/health` səhifəsi aşkarlayır və düzəltməyə imkan verir (ADR-007).
- Bütün bunlar `SPEC.md`-də həll olunur.
