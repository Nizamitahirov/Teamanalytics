# SPEC v2 — Workforce Planning platforması

> **Status:** təsdiq gözləyən hədəf spesifikasiya · **Versiya:** 2.0 · **Tarix:** 2026-11-19
> **Kim üçün:** bu repo üzərində işləyən Claude Code sessiyaları və sahib (Nizami Tahirov).
> **Əvvəlcə oxu:** `CLAUDE.md` (cari sistem, qaydalar), `docs/CONTEXT.md` (tarixçə, data).

Bu sənəd v1 platformasını (canlı: https://teamanalytics.vercel.app) rəhbərliyə təqdim olunan, gündəlik işlənən, tam yetkin **workforce planning** məhsuluna çevirmək üçün nə qurulacağını, necə qurulacağını və "hazırdır" nə demək olduğunu müəyyən edir. Hər bölmədə **qəbul meyarları (QM)** var; QM yerinə yetirilmədən mərhələ bitmiş sayılmır.

---

## 0. Bu sənədlə necə işləmək

1. Mərhələləri (§16) **ardıcıl** icra et. Hər mərhələ ayrıca branch → PR → sahibə qısa xülasə + ekran şəkilləri → sahibin "ok"-u → `main`. Mərhələ daxilində kiçik commit-lər.
2. Hər mərhələnin sonunda canlı sayt işləyir vəziyyətdə olmalıdır (yarımçıq ekran gizli feature flag arxasında saxlanır: `settings.flags`).
3. §7-dəki formulalar **qızıl rəqəmlərlə** test olunur (§13.2). v1 ilə eyni datada eyni nəticə — miqrasiyanın əsas yoxlamasıdır.
4. Burada yazılmayan və sahibə aid qərar (biznes qaydası, rəqəmin mənası) çıxsa → soruş. Texniki detal çıxsa → bu sənədin prinsiplərinə (§1.3) uyğun qərar ver və PR-da qeyd et.
5. Sahib texniki deyil: ondan konsol addımı tələb edən hər şeydən qaç; qaçılmazdırsa, addım-addım, ekran adları ilə yaz.

---

## 1. Məqsəd

### 1.1 Problem
Şöbə rəhbəri ~340 təkrarlanan işin kimdə olduğunu, kimin yükünün normanı aşdığını, hansı işin ləğv/optimizasiya ediləcəyini Excel-də izləyir və rəhbərliyə hər dəfə əl ilə qrafik hazırlayır. v1 bunun əsas hissəsini həll edib; v2 **planlama** (ssenarilər, tövsiyələr), **zaman üzrə izləmə** (trendlər), **rəhbərlik hesabatı** və **etibarlılıq** (rollar, testlər, backup) əlavə edir.

### 1.2 Uğur meyarları (ölçülə bilən)
| # | Meyar | Hədəf |
|---|---|---|
| U1 | Rəhbərlik hesabatının hazırlanma vaxtı | ≤ 1 dəqiqə (bir düymə → PDF) |
| U2 | Bir işi ötürmə | ≤ 3 klik, yükə təsir öncədən görünür |
| U3 | Panelin açılması (təkrar giriş, keşlə) | ≤ 1,0 s ilk mənalı görüntü; ilk giriş ≤ 2,5 s |
| U4 | Başqa istifadəçinin dəyişikliyinin görünməsi | ≤ 10 s |
| U5 | Hesablama düzgünlüyü | Qızıl testlər 100% (§13.2) |
| U6 | Ssenari ilə "nə olardı?" təhlili | Canlı dataya toxunmadan, ≤ 5 s-də müqayisə |
| U7 | Əlçatanlıq | WCAG 2.2 AA (kontrast, klaviatura, ekran oxuyucu) |
| U8 | Firestore pulsuz limiti | 10 aktiv istifadəçi × 8 saat ≤ 50 000 oxuma/gün |

### 1.3 Prinsiplər (qərar verərkən istifadə et)
1. **Rəqəmlər müqəddəsdir.** Rəhbərliyə gedən hər rəqəmin formulası §7-dədir; ekranda hər KPI-ın yanında "?" ilə formulası açılır.
2. **Heç nə itmir.** Silmə yumşaqdır, hər dəyişiklik jurnalda, hər gün backup var, istənilən əməliyyat geri alınır.
3. **Sürət hissdir.** Optimistik UI: istifadəçinin əməli dərhal ekranda; şəbəkə arxa planda.
4. **Sahibə addım yoxdur.** Yeni infrastruktur (Firebase Auth, əlavə xidmət) yalnız mütləq lazımdırsa.
5. **Azərbaycan dili birinci.** Bütün mətnlər az; ingilis dili (§12.3) ikinci dil kimi.
6. **Mövcud qərarlara hörmət.** `docs/CONTEXT.md §4`-dəki qərarlar (server-only Firestore, delta sinxron, diff yazma) qüvvədədir, bu sənəd açıq dəyişmədikcə.

---

## 2. İstifadəçilər və rollar

| Rol | Kim | İcazələr |
|---|---|---|
| `admin` | Şöbə rəhbəri (Nizami), Ecosystem | Hər şey + istifadəçi/rol idarəsi, ayarlar, data sağlamlığı düzəlişləri, backup bərpası |
| `editor` | Şöbənin aparıcı mütəxəssisləri | Tapşırıq/əməkdaş CRUD, ötürmə, ləğv, ssenari yaratmaq və tətbiq etmək (admin təsdiqi ayarı açıqdırsa → təsdiqə göndərmək) |
| `viewer` | Rəhbərlik, HR biznes tərəfdaşları | Yalnız oxuma: panel, hesabatlar, ssenarilərə baxış, Excel/PDF export |

- Rol `users/{id}.role`-da saxlanır. Mövcud istifadəçilər miqrasiyada `admin` olur.
- Server hər `POST`-da rolu yoxlayır (klientdəki gizlətmə yalnız UX-dir).
- Sonuncu `admin`-i silmək/rolunu endirmək qadağandır.
- **Təsdiq axını (istəyə bağlı, ayar `settings.requireApproval`):** editor-un ssenari tətbiqi və ya 40+ saatlıq ötürməsi `pending` statusunda qalır; admin Bildirişlər mərkəzində təsdiqləyir/rədd edir. Default: **söndürülü**.

---

## 3. Əhatə

**Daxildir:** §6-dakı bütün ekranlar, §7 analitika, §8 tövsiyə alqoritmi, §9 Excel v2, §10 təhlükəsizlik, §11 performans, §13 testlər, §14 əməliyyat (backup, cron, monitorinq), §12 dizayn sistemi (açıq/tünd), PWA.

**Daxil deyil (v3):** əmək haqqı/maliyyə dəyəri hesabı (ayar sahəsi saxlanılır, §7.9), HR sistemlərinə (HRB, EMAS, Jira) inteqrasiya, e-poçt bildirişləri, SSO, mobil tətbiq (PWA kifayətdir), çox-şöbəli (multi-tenant) iş.

---

## 4. Arxitektura v2

### 4.1 Stack qərarları
| Sahə | Seçim | Səbəb |
|---|---|---|
| Frontend | **React 18+ + TypeScript + Vite** | Komponent modeli, tiplər, ekosistem; Vercel "Vite" presetini avtomatik tanıyır (sahibə addım yoxdur) |
| Vəziyyət | **Zustand** (+ `immer`) | Kiçik, sadə; mövcud `commit/undo/diffOps` modelinə birbaşa uyğun |
| Qrafiklər | **Apache ECharts 5** (modul importu, tree-shaking) | Sankey, treemap, sunburst, heatmap, gauge, waterfall, böyük data, canvas sürəti, temalar, aria dəstəyi |
| Cədvəl | **TanStack Table** + **TanStack Virtual** | Sıralama, filtr, qruplaşdırma, sütun seçimi, 10 000+ sətirdə virtual scroll |
| Marşrut | **React Router** (hash deyil, history; Vercel rewrite ilə) | Paylaşıla bilən linklər: `/employees/Ülkər`, `/tasks?status=Transfer` |
| Stil | CSS dəyişənləri (tokenlər §12) + **CSS Modules** | v1 dizayn dilini saxlayır; Tailwind lazım deyil |
| Formalar | **React Hook Form + Zod** | Eyni Zod sxemləri serverdə də validasiya üçün (`shared/`) |
| Excel | **SheetJS** (lazy import) | v1 ilə eyni |
| PDF | Brauzerin çap mühərriki + xüsusi `@media print` səhifə (bax §6.7) | Əlavə server/kitabxana yoxdur, vektor qrafiklər |
| İkonlar | **Lucide** (tree-shaken SVG) | Font Awesome webfont-u əvəz edir (daha yüngül) |
| Şrift | Inter (lokal, variable woff2, latin + latin-ext) | `ə` dəstəyi |
| Server | Vercel Functions, **TypeScript**, Node ≥ 20, mövcud `lib/firestore` REST yanaşması | Sübut olunub, tək mühit dəyişəni |
| Test | **Vitest** (unit), **Playwright** (e2e + vizual), mock Firestore (`dev/mock-server`-in TS versiyası) | |
| CI | **GitHub Actions**: typecheck, lint, unit, e2e (mock), build | Hər PR-da |
| Lint/format | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier | |

Versiyalar: icra zamanı ən son **stabil** buraxılış, `package.json`-da dəqiq pin (`^` yox), `package-lock.json` commit olunur.

### 4.2 Qovluq strukturu
```
/
├─ api/                      # Vercel funksiyaları (TS) — yalnız ince adapterlər
│  ├─ login.ts logout.ts me.ts
│  ├─ data.ts ops.ts log.ts
│  ├─ users.ts               # admin
│  ├─ scenarios.ts           # ssenari CRUD + apply
│  ├─ snapshots.ts           # trend datası (oxuma)
│  ├─ health.ts
│  └─ cron/daily.ts          # gündəlik snapshot + backup (Vercel Cron)
├─ server/                   # server məntiqi (testlənə bilən, Vercel-dən asılı deyil)
│  ├─ firestore.ts auth.ts http.ts rbac.ts ratelimit.ts
│  └─ services/ (data, ops, users, scenarios, snapshots, backup)
├─ shared/                   # həm klient, həm server
│  ├─ schema.ts              # Zod: Task, Employee, LogEntry, Settings, Scenario, Op
│  ├─ metrics.ts             # §7 formulaları — TƏK MƏNBƏ
│  ├─ rebalance.ts           # §8 alqoritmi
│  └─ i18n/ (az.ts, en.ts)
├─ src/                      # React tətbiqi
│  ├─ app/ (router, layout, providers)
│  ├─ store/ (data, sync, undo, ui)
│  ├─ features/
│  │  ├─ dashboard/ employees/ tasks/ scenarios/ optimization/
│  │  ├─ reports/ health/ log/ settings/ auth/ palette/
│  ├─ components/ (Button, Card, Kpi, Drawer, Modal, Toast, DataTable, Chart, Badge, EmptyState, Skeleton...)
│  ├─ charts/ (theme.ts, options/*.ts — hər qrafik üçün saf funksiya: data → ECharts option)
│  └─ styles/ (tokens.css, base.css, print.css)
├─ data/seed.json            # dəyişməz
├─ dev/                      # mock-server.ts, e2e/
├─ tests/ (unit/, golden/)
├─ docs/ (CONTEXT.md, ADR-*.md)
├─ CLAUDE.md SPEC.md README.md
└─ vercel.json               # rewrites (SPA), headers (CSP), crons
```
`public/` (v1) miqrasiyadan sonra silinir; v1 kodu `git` tarixçəsində qalır.

### 4.3 Sinxronizasiya mühərriki (v1 modeli saxlanır, gücləndirilir)
- `store/sync.ts`: `pull(since)`, `enqueue(ops)`, `flush()` — v1 məntiqi (CLAUDE.md §6) TypeScript-ə köçürülür, davranış eyni.
- **Əlavələr:**
  - **Versiya ilə ziddiyyət aşkarlama:** hər `tasks`/`employees` sənədində `_v` (tam ədəd). Klient `upsert` göndərəndə gördüyü `_v`-ni yollayır; server Firestore **tranzaksiyası** daxilində (`:beginTransaction` → `:batchGet` → `:commit` həmin `transaction` ilə) cari `_v`-ləri oxuyur, uyğun olanları `_v+1` ilə yazır, uyğun gəlməyənləri yazmır və `conflicts` siyahısında qaytarır (oxuma büdcəsi: dəyişən sənəd sayı qədər) → klient "Bu tapşırığı X istifadəçisi indicə dəyişdi: [Onun versiyası] [Mənimki]" dialoqu göstərir. (Sahə səviyyəsində avtomatik birləşdirmə: fərqli sahələr dəyişibsə səssiz birləşdir.)
  - **Offline növbə:** `navigator.onLine === false` olanda dəyişikliklər `IndexedDB`-də növbədə saxlanır, bağlantı gələndə göndərilir; üst paneldə "Offline — 3 dəyişiklik gözləyir".
  - **Yoxlama intervalı:** görünən səhifədə 10 s; arxa planda dayanır; fokusa qayıdanda dərhal.
  - **Keş:** `localStorage` əvəzinə `IndexedDB` (`idb-keyval`), açar `wfp.v2`.
- **Hazırlıqlı yol (feature flag `realtime`, default söndürülü):** server `firebase-admin` olmadan REST ilə **custom token** imzalayır → klient Firestore Web SDK `onSnapshot` ilə real-time. Yalnız sahib Firebase Auth-u aktiv etməyə razılaşarsa və qaydalar deploy edilərsə açılır. v2-nin bitməsi bundan asılı deyil.

### 4.4 API müqavilələri
Bütün cavablar JSON; xətalar `{ error: string, code: string }` (az mətn + maşın kodu). Bütün `POST`-lar `Origin` başlığı yoxlanır (CSRF).

| Endpoint | Rol | Sorğu | Cavab |
|---|---|---|---|
| `POST /api/login` | — | `{username,password}` | `{user:{name,role}}` + cookie |
| `POST /api/logout` | hamı | — | `{ok}` |
| `GET /api/me` | hamı | — | `{user:{name,role}, settings, flags}` |
| `GET /api/data?since=` | hamı | — | v1 formatı + `scenarios` (meta), `notifications` |
| `POST /api/ops` | editor+ | `{ops: Op[]}` (Zod) | `{ok, conflicts?: Conflict[]}` |
| `GET /api/log?from=&to=&cursor=` | hamı | — | səhifələnmiş jurnal |
| `GET/POST /api/users` | admin | add / password / role / remove / revoke | |
| `GET/POST /api/scenarios` | viewer oxu, editor yaz | create / update / delete / apply | |
| `GET /api/snapshots?from=&to=` | hamı | — | gündəlik KPI seriyası |
| `GET /api/health` | — | — | v1 + `version`, `firestore: ok/err`, `lastBackup` |
| `GET /api/cron/daily` | Vercel Cron (`CRON_SECRET` başlığı) | — | snapshot + backup |

`Op` tipləri: v1 (`upsert`/`delete`/`log`, cədvəllər `Tasks|Employees|Settings`) + `Absences`, `Comments`.

### 4.5 Məlumat modeli v2
Mövcud sahələr **dəyişmir** (geriyə uyğunluq); yeni sahələr isteğe bağlıdır.

**`tasks`** (+ yeni):
| Sahə | Tip | Təyinat |
|---|---|---|
| `tags` | string[] | sərbəst etiketlər (məs. "rüblük", "audit") |
| `priority` | `low|normal|high|critical` | default `normal` |
| `automation` | `none|candidate|in_progress|done` | optimizasiya portfeli statusu (§6.6) |
| `automation_note` | string | nə ediləcək |
| `due_quarter` | `2027-Q1` | optimizasiyanın hədəf rübü |
| `eligible` | string[] | bu işi görə bilən əməkdaşlar (tövsiyə alqoritmi üçün; boş = hamı) |
| `history_count` | number | ötürmə sayı (sürətli göstərici) |
| `_v` | number | versiya |

**`employees`** (+ yeni): `role_title` (vəzifə), `email` (istəyə bağlı), `capacity_overrides` (il üzrə: `{2027: 0.8}`), `skills` (string[] — proses adları), `manager`, `start_date`, `end_date` (ayrılma → avtomatik "aktiv deyil" + "Hamısını ötür" xəbərdarlığı), `_v`.

**Yeni kolleksiyalar:**
| Kolleksiya | Sənəd | Sahələr |
|---|---|---|
| `absences` | auto id | `employee, from, to, kind (məzuniyyət/xəstəlik/təlim/digər), hours` — tutumu azaldır (§7.3) |
| `comments` | auto id | `task_id, user, text, ts, _ts` — tapşırıq altında müzakirə |
| `scenarios` | auto id | `name, description, base_ts, created_by, status (draft/pending/applied/archived), changes: Op[], summary` |
| `snapshots` | `YYYY-MM-DD` | gündəlik KPI-lar (§7.10) — trend qrafikləri üçün |
| `backups` | `YYYY-MM-DD` + hissələr | gzip+base64 JSON, ≤ 900 KB/hissə, 30 gün saxlanır |
| `notifications` | auto id | `to, kind, text, link, read, ts` |
| `meta/main` | | + `schema_version: 2`, `flags`, `requireApproval`, `fiscal_year`, `norms: {2026:1922, 2027:...}` |
| `users` | | + `role`, `session_version` (dəyişəndə bütün sessiyalar etibarsız), `last_login`, `failed_attempts`, `locked_until` |

**Miqrasiya (`schema_version` 1 → 2):** `POST /api/ops` tərəfindən deyil, ayrıca idempotent skript `server/migrations/002.ts` (admin `/settings/maintenance`-dən işə salır): `_v=1`, `priority=normal`, `automation` = `after_opt != null ? 'candidate' : 'none'`, istifadəçilərə `role=admin`. Əvvəl avtomatik backup. Yalnız boş sahələri doldurur.

**Pulsuz limit büdcəsi:** tam yükləmə ≤ 1 000 oxuma; yoxlama 1 oxuma; snapshot oxuması ayda 1 sorğu (30 sənəd). `comments` yalnız tapşırıq açılanda oxunur.

---

## 5. Naviqasiya və qabıq (shell)

- **Sol menyu (desktop ≥ 1024 px):** Panel · Əməkdaşlar · Tapşırıqlar · Ssenarilər · Optimizasiya · Hesabatlar — ayırıcı — Data sağlamlığı · Jurnal · Ayarlar. Daralda bilir (yalnız ikonlar, 72 px). Altda: sinxron statusu, istifadəçi (ad, rol), çıxış.
- **Aşağı naviqasiya (< 1024 px):** Panel · Əməkdaşlar · Tapşırıqlar · Ssenarilər · "Daha çox" (qalanları vərəqdə).
- **Üst panel:** səhifə adı + breadcrumb, qlobal filtr çipləri (Şirkət, Fəaliyyət forması — bütün səhifələrə təsir edir, URL-də saxlanır), axtarış (⌘K/Ctrl+K), geri al/irəli al, bildirişlər (🔔 sayğac), Import, Export.
- **Komanda paleti (⌘K):** tapşırıq/əməkdaş axtarışı (fuzzy, `ə/e`, `ı/i`, `ö/o`, `ü/u`, `ş/s`, `ç/c`, `ğ/g` bərabər sayılır), əməliyyatlar ("Ülkərin işlərini ötür", "Yeni tapşırıq", "Hesabatı çap et", "Tünd rejim").
- **Klaviatura:** `g p` Panel, `g e` Əməkdaşlar, `g t` Tapşırıqlar, `n` yeni tapşırıq, `/` axtarış, `Ctrl+Z / Ctrl+Shift+Z`, `?` qısayollar siyahısı. Hamısı Ayarlarda göstərilir.
- **Bildirişlər mərkəzi:** təsdiq gözləyənlər, "sizə iş ötürüldü", data sağlamlığı xəbərdarlıqları, uğursuz sinxron.
- **Hər səhifənin vəziyyətləri:** yüklənir (skeleton, spinner yox), boş (izah + əsas əməliyyat düyməsi), xəta (nə oldu + "yenidən cəhd et"), offline.

---

## 6. Ekranlar

> Hər qrafik `src/charts/options/<ad>.ts`-də **saf funksiya** kimi (data → ECharts option), unit test ilə. Hər qrafikin sağ üstündə: ⓘ (nəyi göstərir, formula), "Cədvəl kimi bax" (əlçatanlıq + dəqiq rəqəmlər), "PNG/SVG yüklə", tam ekran.

### 6.1 Giriş
- v1 dizaynı saxlanır (tünd fon, qradiyent işıqlar). Əlavə: "Məni xatırla" (sessiya 12 s → 7 gün), Caps Lock xəbərdarlığı, 5 uğursuz cəhddən sonra hesab 15 dəq kilidlənir (Firestore-da, instansiyadan asılı deyil), dil seçimi (az/en).
- **QM:** yanlış parol ümumi mesaj göstərir (hansının səhv olduğunu demir); kilid mesajı vaxtı göstərir; ekran oxuyucu sahə adlarını oxuyur.

### 6.2 Panel (Komanda mərkəzi)
Yuxarıdan aşağı. Bütün vidjetlər qlobal filtrlərə və **"Görünüş" seçicisinə** tabedir: `Cari` · `Optimizasiyadan sonra` · `Ssenari: <ad>` (ssenari seçiləndə hər vidjet ssenari datası ilə hesablanır və cari ilə fərq kiçik "Δ" etiketi ilə göstərilir).

1. **Hero (qradiyent kart)** — 4 KPI, hər biri: böyük rəqəm, vahid, alt mətn, **30 günlük sparkline** (snapshots) və dəyişmə (`▲ 2,1 FTE 30 gündə`):
   - İllik iş həcmi (saat) · Lazım olan ştat (FTE) · Mövcud ştat (FTE) · Ehtiyat / çatışmazlıq (FTE, rəng: müsbət ağ, mənfi açıq qırmızı çip + ikon).
2. **İkinci sıra KPI kartları (4):** Norması aşan (nəfər, klik → filtrlənmiş əməkdaşlar) · Ləğvdən qənaət (saat, FTE) · Ötürülmüş işlər (say, saat) · Optimizasiya portfeli (potensial/realizə olunmuş saat, progress bar).
3. **Tutum balansı — "bullet" qrafik:** bir üfüqi zolaq: lazım olan FTE (tünd marker) vs mövcud FTE (zolaq) vs optimizasiyadan sonra lazım olan (boz marker). Tək baxışda "kifayət edirmi?" cavabı.
4. **Əməkdaşların yüklənməsi** (v1-in təkmilləşməsi): üfüqi bar, sıralı; 85–100% zona fonla (markArea), 100% qırıq xətt + etiket; bar rəngi status rəngi + **ikon/naxış** (rəng tək daşıyıcı deyil); hover: saat/norma/tapşırıq sayı/fəaliyyət forması; klik → əməkdaş drawer-i; "Qrupları göstər" açarı. Absences varsa barın içində zolaqlı hissə: "məzuniyyət səbəbilə azalmış tutum".
5. **Ötürmə axını — Sankey:** sol: ilkin sahib (`owner_before`), sağ: cari sahib; axının eni = saat. Yalnız `Transfer` statuslu aktiv işlər. Node rəngi neytral, axın rəngi qəbul edənin yük statusu ilə (yarı şəffaf). Klik axın → həmin işlərin siyahısı. "Rəhbərliyə: kimdən kimə nə qədər iş getdi" sualının cavabı.
6. **İş həcminin strukturu — Treemap (drill-down):** Şirkət → Proses → Kateqoriya → Tapşırıq; sahə = saat; rəng = şirkət (varlığa bağlı). Breadcrumb ilə geri. Alternativ görünüş açarı: Sunburst.
7. **Yük xəritəsi — Heatmap:** sətirlər əməkdaşlar (yükə görə sıralı), sütunlar proseslər (ən böyük 15 + "Digər"); xana = saat (ardıcıl birrəngli şkala, açıqdan tünd narıncıya); boş xana = 0. "Hansı proses kimin üzərində cəmləşib, kim əvəzedilməzdir" (bus factor) — tək icraçılı proseslər xananın küncündə "1" nişanı.
8. **Ləğv və optimizasiya — Waterfall:** "Bütün işlər (ilkin)" → "− Ləğv edilənlər" → "− Optimizasiya (realizə olunmuş)" → "= Cari iş həcmi" → "− Optimizasiya potensialı" → "= Hədəf". Hər pillə saat və FTE.
9. **Pareto — Proseslər:** saata görə azalan barlar; ayrıca nazik "kumulyativ %" zolağı barların üstündə (ikinci ox **yoxdur**); 80% kəsişməsi qeyd olunur: "İşlərin 80%-i N prosesdədir".
10. **Yük paylanması — Histogram/beeswarm:** əməkdaşların yük faizləri 10% addımlarla; median və norma xətləri.
11. **Trend (snapshots):** xətti qrafik, 2 seriya ayrı-ayrı **kiçik çoxluqlar** (small multiples, ox ortaq deyil): (a) Lazım olan vs mövcud FTE, (b) Norması aşanların sayı. Dövr seçimi: 30/90/365 gün. Snapshot yoxdursa boş vəziyyət: "Trend datası hər gün toplanır; ilk qrafik sabah görünəcək".
12. **Şirkət × Fəaliyyət forması matrisi:** 2×2 kartlar (saat, FTE, nəfər, tapşırıq) — v1 "Bölgü" vidjetinin əvəzi.
13. **Ştat cədvəli:** v1 cədvəli + sütunlar: tutum (absences nəzərə alınmış), boş saat, tək icraçı olduğu proses sayı, son 30 gündə alınan/verilən saat. CSV/Excel export.

**Panel düzəni:** 12 sütunlu grid; 1440 px: 1 (12), 2 (4×3), 3 (12), 4 (8) + 12 (4), 5 (12), 6 (7) + 8 (5), 7 (12), 9 (6) + 10 (6), 11 (12), 13 (12). < 1024 px: hamısı 12 sütun, ardıcıllıq eyni. İstifadəçi vidjetləri gizlədib sırasını dəyişə bilər (yalnız öz görünüşü; `localStorage`).

**QM (Panel):**
- v1 seed datası ilə: iş həcmi 27 850, lazım 14,5 FTE, mövcud 18,0, norması aşan 3, ləğvdən qənaət 933, transfer 121, optimizasiya potensialı 55 (§13.2 qızıl rəqəmlər).
- Filtr dəyişəndə bütün vidjetlər ≤ 150 ms-də yenilənir (341 tapşırıq), ≤ 600 ms (10 000 tapşırıq).
- Hər qrafikin "Cədvəl kimi bax" görünüşü eyni rəqəmləri verir.
- Tünd rejimdə bütün qrafiklər tünd palitra ilə (§12.2), kontrast ≥ 3:1.

### 6.3 Əməkdaşlar
**Siyahı (kartlar + cədvəl görünüşü açarı):** v1 kartları + son 30 gün dəyişməsi, tək icraçı olduğu proseslər nişanı, absence nişanı. Filtrlər: şirkət, fəaliyyət forması, yük səviyyəsi, aktiv/ayrılmış. Toplu: seçilmiş əməkdaşların işlərini ssenariyə əlavə et.

**Profil səhifəsi `/employees/:name`** (drawer əvəzinə tam səhifə; drawer sürətli baxış üçün qalır):
- Başlıq: ad, vəzifə, şirkət, fəaliyyət forması, ştat, menecer; əməliyyatlar: Redaktə, Hamısını ötür, Ayrılmanı qeyd et, Profilləri birləşdir.
- **Tutum kartı:** norma × ştat − absences = effektiv tutum; yük gauge (0–150%, zonalar).
- **Tapşırıqlar cədvəli** (§6.4 komponenti, filtrlənmiş).
- **Proses paylanması** — donut yox, üfüqi 100% bar (prosesə görə).
- **Tarixçə timeline:** alınan/verilən işlər, ləğvlər (jurnaldan), tarixə görə.
- **Absences:** təqvim zolağı (il), əlavə et/sil.
- **Əvəzedicilik:** bu əməkdaşın işlərini görə biləcək digər əməkdaşlar (`eligible`/`skills`) — "Bu şəxs gedərsə" ssenarisi bir kliklə.

**Ayrılma axını:** `end_date` qoyulanda: "N aktiv iş, X saat. Tövsiyə olunan bölgü:" → §8 alqoritminin təklifi → "Ssenari kimi aç" / "Dərhal tətbiq et".

**QM:** ad dəyişmə/birləşmə bütün tapşırıqlarda, jurnalda (yeni qeyd ilə) və ssenarilərdə əks olunur; birləşdirmədən əvvəl önizləmə (neçə iş, saat); geri alınır.

### 6.4 Tapşırıqlar (data grid)
- TanStack Table, virtual scroll, yapışqan başlıq və **yapışqan əməliyyat sütunu** (v1-də düzəldilmiş problem — reqressiya testi).
- Sütunlar (göstər/gizlət, sırala, eni dəyiş, yadda saxla): Seçim, ID, Şirkət, Proses, Kateqoriya, Tapşırıq, Cari icraçı, İlkin icraçı, Status, Prioritet, Etiketlər, 1 əməliyyata dəq, Təkrar/il, Vahid, Saat/il, Opt. sonra, Avtomatlaşdırma, Son dəyişiklik (kim, nə vaxt).
- **Qruplaşdırma:** proses / icraçı / kateqoriya / status üzrə, qrup cəmləri ilə.
- **Filtrlər:** sütun başlığında + üstdə sürətli çiplər ("Transferlər", "Ləğv olunanlar", "Normanı aşanların işləri", "Saat uyğunsuzluğu"). URL-də saxlanır; "Görünüşü yadda saxla" (adlı görünüşlər, istifadəçiyə məxsus).
- **Sətirdə redaktə:** icraçı (axtarışlı select, yük faizi ilə), prioritet, saat — Enter yadda saxlayır, Esc ləğv edir.
- **Tapşırıq paneli** (sağ drawer): bütün sahələr, hesablanmış saat vs daxil edilmiş saat uyğunsuzluğu xəbərdarlığı (> 5% fərq), şərhlər, tarixçə (jurnaldan), "Ssenariyə əlavə et".
- **Toplu əməliyyatlar:** ötür, ləğv et, bərpa et, prioritet/etiket/avtomatlaşdırma statusu dəyiş, sil (yalnız admin), Excel-ə seçilənləri export.
- **Ötürmə dialoqu (v1 + ):** qəbul edənlər yük faizi ilə sıralı; hər namizəd üçün "sonra: 92%"; uyğun olmayanlar (`eligible`) boz; tövsiyə (§8) ilk sırada "Tövsiyə" nişanı ilə.

**QM:** 10 000 sətirdə scroll 60 fps, filtr ≤ 100 ms; telefonda kart görünüşü (v1 kimi); bütün əməliyyatlar klaviatura ilə mümkündür.

### 6.5 Ssenarilər (Planlama laboratoriyası)
Canlı dataya toxunmadan "nə olardı?" təhlili — v2-nin əsas yeniliyi.
- **Siyahı:** ad, müəllif, status (qaralama / təsdiq gözləyir / tətbiq edilib / arxiv), dəyişiklik sayı, təsir (Δ FTE, Δ normanı aşanlar).
- **Ssenari redaktoru:** sol tərəfdə ssenari daxilindəki dəyişikliklərin siyahısı (ötür, ləğv et, saat dəyiş, yeni iş, əməkdaş əlavə et/çıxar, ştat dəyiş, normanı dəyiş); mərkəzdə Panelin yığcam versiyası **ssenari datası ilə**; sağda **müqayisə**: Cari vs Ssenari — KPI-lar yan-yana, yük barları qoşa (boz cari, narıncı ssenari), dəyişən əməkdaşlar siyahısı.
- **Şablonlar:** "Əməkdaş ayrılır", "Yeni əməkdaş gəlir (ştat)", "Prosesi avtomatlaşdır (−X%)", "Yükü balansla (§8)", "Normanı dəyiş (məs. 2027)".
- **Bütün ssenari dəyişiklikləri `Op[]` kimi saxlanır**; ssenari datası = baza (cari) + op-ların lokal tətbiqi (`shared/apply.ts`, server və klient eyni kod).
- **Tətbiq et:** önizləmə (hansı sənədlər dəyişəcək) → `requireApproval`-a görə birbaşa və ya təsdiqə → tətbiqdə ssenari yaradılandan sonra dəyişmiş sənədlər üçün ziddiyyət yoxlaması (`_v`) → ziddiyyət varsa siyahı və seçim. Tətbiq bir jurnal qrupu yaradır ("Ssenari: X tətbiq edildi", alt qeydlər), tək düymə ilə geri alınır.
- **Müqayisə:** 2–3 ssenarini yan-yana (kiçik çoxluqlar).

**QM:** ssenari açılışı ≤ 1 s; ssenaridə dəyişiklik cari dataya heç bir yazma etmir (testlə yoxlanır); tətbiq sonrası rəqəmlər ssenaridə görünənlə eynidir.

### 6.6 Optimizasiya portfeli
- Kanban: **Namizəd → İcrada → Tamamlandı** (+ "Rədd edildi"); kart: tapşırıq, proses, cari saat, hədəf saat (`after_opt`), qənaət, hədəf rüb, məsul.
- Üstdə: ümumi potensial, realizə olunmuş qənaət (status=done olanların `hours − after_opt`), rüblər üzrə plan vs fakt (bar).
- "Tamamlandı" edilərkən: "Saatı `after_opt` ilə əvəz edək?" — təsdiqlə `hours` yenilənir, köhnə dəyər jurnalda.
- Avtomatik namizədlər: `after_opt` olan, yüksək təkrarlı (annual_freq ≥ 500) və 1 əməliyyata ≤ 10 dəq olan işlər "Avtomatlaşdırma üçün yaxşı namizəd" nişanı ilə.

### 6.7 Hesabatlar (rəhbərlik üçün)
- **"Rəhbərlik hesabatı" — bir düymə:** A4 üfüqi, çap üçün dizayn olunmuş səhifə (`/reports/executive?date=&filters=`), brauzerin "PDF kimi saxla" funksiyası ilə; avtomatik `window.print()`.
  1. Titul: başlıq, tarix, filtrlər, hazırlayan.
  2. Xülasə: 4 hero KPI + 3 cümləlik avtomatik şərh (şablon əsaslı, LLM yox): "Şöbədə 14,5 FTE iş var, 18 ştat mövcuddur (+3,5 ehtiyat). 3 əməkdaş normanı aşır: Ülkər (113%), …. Son 30 gündə 12 iş ötürülüb (420 saat)."
  3. Yük qrafiki, Sankey, Waterfall, Pareto (vektor, çap rəngləri).
  4. Riskler: normanı aşanlar, tək icraçılı kritik proseslər, data sağlamlığı xəbərdarlıqları.
  5. Əlavə: ştat cədvəli.
- **Digər hesabatlar:** Əməkdaş kartı (PDF), Proses hesabatı, Dövr müqayisəsi (iki snapshot tarixi arasında), Jurnal hesabatı (dövr, istifadəçi).
- **Export:** Excel (v1 4 vərəqi + "Hesabat" vərəqi KPI-larla), CSV, PNG (hər qrafik).

**QM:** Chrome/Edge-də "PDF kimi saxla" ilə 2–4 səhifə, qrafiklər kəsilmir (`break-inside: avoid`), rənglər çapda görünür (`print-color-adjust: exact`), mətn seçilə bilir.

### 6.8 Data sağlamlığı
Avtomatik yoxlamalar (hər data dəyişikliyində klientdə, Panelə xəbərdarlıq sayı):
| Yoxlama | Qayda | Düzəliş əməliyyatı |
|---|---|---|
| Ad dublikatı ehtimalı | Normallaşdırılmış adlar (§5 hərf bərabərliyi, kiçik hərf, boşluqsuz) eyni və ya Levenshtein ≤ 1 | "Birləşdir" (önizləmə ilə) / "Fərqlidir" (yadda saxla, bir daha göstərmə) |
| Təkrar tapşırıq | eyni `company+process+category+task+owner_before+hours` | "Birini sil (ləğv)" |
| Saat uyğunsuzluğu | `min_per_key` və `annual_freq` dolu, `|hours − m×f/60| / hours > 5%` | "Hesablanmışla əvəz et" / "Saxla" |
| ID problemi | `x` ilə yaradılmış ID, boş sahələr | "Düzəlt" |
| Sahibsiz iş | cari icraçı əməkdaş siyahısında yoxdur və ya `active=false` | "Ötür" |
| Tutumsuz əməkdaş | aktiv iş var, `fte = 0` | "Ştatı təyin et" |
| Ayrılmış əməkdaşda iş | `end_date` keçib, aktiv işi var | "Hamısını ötür" |
Seed datada gözlənilən tapıntılar: Farida/Fəridə, Kamila/Kamilə, `B-1770271295121`≈`B-44`, `P-x71`≈`P-71`, `P-29` saatı (`docs/CONTEXT.md §2`).

### 6.9 Jurnal
- Server tərəfli səhifələmə (cursor), filtrlər: dövr, istifadəçi, əməliyyat, əməkdaş, tapşırıq.
- Qruplaşdırılmış qeydlər (toplu əməliyyat/ssenari bir başlıq altında açılır).
- Hər qeyddən: tapşırığa keç, "bu dəyişikliyi geri al" (yalnız son vəziyyət hələ həmin dəyərdirsə; deyilsə izah).
- Gündəlik qruplama, "bu gün / dünən".

### 6.10 Ayarlar
Bölmələr (sol alt-menyu):
- **Ümumi:** il, norma (illər üzrə cədvəl: 2026 = 1922), yüksək yük həddi, valyuta/saat dəyəri (v3 üçün sahə), dil, tünd/açıq/sistem.
- **İstifadəçilər** (admin): əlavə et, rol, parol sıfırla, sessiyaları ləğv et, son giriş, kilidi aç.
- **Siyahılar:** şirkətlər (rəngi ilə), fəaliyyət formaları, proseslər və kateqoriyalar (ad dəyiş = hamısında dəyişir), vahidlər, etiketlər.
- **Təsdiq axını:** aç/bağla, hədd (saat).
- **Data:** Excel import/export, şablon, backup siyahısı (son 30 gün) + "Bu backup-dan bərpa et" (önizləmə, admin, iki dəfə təsdiq), "İlkin dataya qayıt" yalnız admin.
- **Texniki xidmət** (admin): miqrasiya statusu, `/api/health` nəticəsi, Firestore istifadəsi (bugün oxuma/yazma təxmini), feature flag-lar.
- **Qısayollar** siyahısı.

### 6.11 PWA
`manifest.webmanifest` (ad, ikonlar, `theme_color #090A13`), service worker (yalnız statik aktivlər, API keşlənmir), "Ana ekrana əlavə et". Offline açılış: son keşlənmiş data ilə yalnız oxuma + növbə (§4.3).

---

## 7. Analitika — formulalar (tək mənbə: `shared/metrics.ts`)

Notasiya: `T` = tapşırıqlar, `E` = əməkdaşlar, `cur(t) = t.owner_after || t.owner_before`, `active(t) = !t.is_cancelled`, `N(y)` = il üçün norma (default 1922), `filters` = şirkət/fəaliyyət forması.

7.1 **Effektiv saat:** `h(t, view)` = `view=opt && t.after_opt != null ? t.after_opt : t.hours`.
7.2 **İllik iş həcmi:** `Σ h(t)` aktiv və filtrə uyğun `t` üzrə. Fəaliyyət forması filtri `activity(cur(t))` ilə.
7.3 **Tutum (əməkdaş):** `cap(e) = N × fte(e) × (capacity_override(y) ?? 1) − Σ absence.hours(e, y)`; absences saatı verilməyibsə `iş günləri × 8`. Qrup (`is_group`) üçün tutum hesablanmır.
7.4 **Yük:** `load(e) = Σ h(t) [cur(t)=e, active] / cap(e)`. Səviyyə: `> 1` kritik, `> warn` yüksək, `= 0` boş, digər normal.
7.5 **Lazım olan FTE:** `Σ h(t) / N`. **Mövcud FTE:** `Σ fte(e)` aktiv işi olan, `!is_group`, `active` əməkdaşlar üzrə. **Ehtiyat:** `Mövcud − Lazım`.
7.6 **Ləğvdən qənaət:** `Σ t.hours` (`is_cancelled`, filtrə uyğun). Dublikat seed sətri daxildir (v1 ilə uyğunluq üçün); Data sağlamlığında düzəldilsə avtomatik düşür.
7.7 **Transfer:** aktiv, `owner_before && owner_after && owner_before ≠ owner_after`. Sankey çəkisi `h(t)`.
7.8 **Optimizasiya potensialı:** `Σ (t.hours − t.after_opt)` aktiv, `after_opt != null`, `automation ≠ done`. **Realizə olunmuş:** `automation = done` olanlar üçün jurnaldakı köhnə saat − yeni saat.
7.9 **(v3 hazırlığı) Dəyər:** `saat × settings.hourly_cost` — UI-da v2-də gizli.
7.10 **Gündəlik snapshot** (`snapshots/YYYY-MM-DD`): ümumi və hər şirkət üzrə: iş həcmi, lazım/mövcud FTE, normanı aşanlar, transfer sayı/saatı, ləğv saatı, optimizasiya potensialı/realizə, əməkdaş başına yük (ad → %). Cron 23:50 Bakı vaxtı (19:50 UTC).
7.11 **Tək icraçı riski:** proses `p` üçün aktiv işlərin cari icraçılarının unikal sayı = 1 və prosesin saatı ≥ 100 → risk.
7.12 **Yuvarlaqlaşdırma:** hesablamalar tam dəqiqlikdə; göstərişdə saat 0 onluq (< 100 olduqda 1), FTE 1 onluq (KPI) / 2 onluq (cədvəl), faiz 0 onluq. Formatlama `Intl.NumberFormat('az-AZ')`, ICU olmayan brauzer üçün öz formatlayıcı: minlik ayırıcı boşluq (U+202F), onluq ayırıcı vergül.

---

## 8. Yükü balanslama tövsiyəsi (`shared/rebalance.ts`)

**Məqsəd:** normanı aşan (və ya `warn`-u keçən — seçim) əməkdaşların yükünü həddin altına salmaq üçün minimum sayda ötürmə təklif etmək.

**Giriş:** aktiv işlər, əməkdaşlar (aktiv, qrup deyil), hədd `θ` (default 1,0; seçim 0,85), məhdudiyyətlər: eyni şirkət daxilində (default açıq), eyni fəaliyyət forması (default söndürülü), `eligible`/`skills` uyğunluğu (varsa), "toxunma" siyahısı (kilidli işlər).

**Alqoritm (deterministik greedy):**
1. Donorlar = `load > θ`, azalan yükə görə.
2. Hər donor üçün işlərini saata görə **artan** sırala (kiçik işlər əvvəl — az pozuntu), kilidliləri çıxar.
3. Hər iş üçün qəbul edənlər = uyğun əməkdaşlar, `load_after = load + h/cap ≤ θ − 0,05` (5% bufer); aralarından ən aşağı `load_after`; bərabərlikdə həmin prosesi artıq görən (bilik davamlılığı), sonra ad üzrə.
4. Donorun yükü `≤ θ` olana qədər davam; heç bir qəbul edən yoxdursa dayan və "çatışmazlıq: X saat — yeni ştat və ya optimizasiya lazımdır" de.
5. Nəticə: ötürmələr siyahısı, əvvəl/sonra yüklər, həll olunmayan qalıq.

**UI:** Panel/Əməkdaşlar/Ssenarilər-dən "Yükü balansla" → nəticə ssenari kimi açılır (heç vaxt birbaşa tətbiq olunmur). Hər təklif sətrində "çıxar/kilidlə".

**QM:** unit testlər: (a) seed datada nəticə deterministikdir (eyni giriş → eyni çıxış); (b) heç bir qəbul edən θ−0,05-i keçmir; (c) çatışmazlıq düzgün hesablanır; 341 iş ≤ 50 ms.

---

## 9. Excel v2

- **Export:** v1 vərəqləri (Tapşırıqlar, Əməkdaşlar, Yük analizi, Jurnal) + "Hesabat" (KPI-lar, tarix, filtrlər) + "Ssenari" (seçilibsə). Sütun enləri, başlıqların formatı, saat sütunlarına rəqəm formatı, avtofiltr, dondurulmuş başlıq.
- **Import sehrbazı (4 addım):**
  1. Fayl + vərəq seçimi.
  2. **Sütun xəritəsi:** avtomatik tanıma (v1 alias-ları + `docs/CONTEXT.md §2` başlıqları; `İ/i` normallaşdırması — v1-də tapılmış bug-ın reqressiya testi), əl ilə düzəliş, yadda saxlanan xəritələr.
  3. **Validasiya + diff önizləmə:** yeni / dəyişəcək (sahə-sahə köhnə→yeni) / dəyişməyən / xətalı sətirlər; xətalar sətir nömrəsi və səbəblə; "yalnız xətasızları yüklə".
  4. **Rejim:** yenilə+əlavə et (default) / ssenari kimi yüklə / əvəz et (yalnız admin, avtomatik backup sonra).
- Import həmişə diff op-ları ilə yazılır (heç vaxt kolleksiyanı əvəz etmir — CLAUDE.md §6 qadağası).

---

## 10. Təhlükəsizlik

- **RBAC** serverdə (`server/rbac.ts`), hər endpoint-də rol yoxlaması; testlərlə (viewer `POST /api/ops` → 403).
- **Sessiya:** cookie `__Host-wfp_session` (Secure, HttpOnly, SameSite=Lax, Path=/); payload `{u, role, sv, exp}`; `sv` ≠ `users.session_version` → etibarsız (istifadəçi silinəndə/parol dəyişəndə dərhal çıxış). `users` sənədi hər sorğuda yox, 60 s keşlə oxunur (oxuma büdcəsi).
- **CSRF:** `POST`-larda `Origin`/`Sec-Fetch-Site` yoxlanır.
- **Rate limit:** login — Firestore-da istifadəçi üzrə (`failed_attempts`, `locked_until`); API — instansiya yaddaşında 300 sorğu/dəq/istifadəçi.
- **Parol siyasəti:** ≥ 10 simvol, ən çox yayılmış 1 000 parol siyahısına qarşı yoxlama; `Ecosystem/Ecosystem` ilk girişdə **məcburi parol dəyişməsi** ekranı (sahibə əvvəlcədən bildir).
- **Başlıqlar:** CSP (`default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdn.sheetjs.com; connect-src 'self'; frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Input:** bütün `POST` gövdələri Zod ilə; mətn sahələri ≤ 2 000 simvol; HTML render React-in escaping-i (heç vaxt `dangerouslySetInnerHTML`).
- **Sirlər:** yalnız Vercel env; `CRON_SECRET` (Vercel Cron avtomatik verir) cron endpoint-i üçün.
- **Audit:** hər `POST` jurnala `user`, `ip_hash` (SHA-256, duzlu) ilə.

---

## 11. Performans büdcələri

| Ölçü | Hədəf |
|---|---|
| İlkin JS (gzip) | ≤ 180 KB (ECharts, SheetJS, Table — route/lazy chunk-larda) |
| CSS (gzip) | ≤ 30 KB |
| LCP (4G, orta noutbuk) | ≤ 1,8 s; təkrar giriş ≤ 1,0 s (IndexedDB keş) |
| INP | ≤ 150 ms |
| CLS | ≤ 0,05 (skeletonlar ölçülü) |
| `GET /api/data` tam | ≤ 1,5 s (341 iş), delta "dəyişməyib" ≤ 400 ms |
| `POST /api/ops` | ≤ 1,2 s p95 |
| Qrafik render (341 iş) | ≤ 100 ms hər biri; hesablamalar memoize (`useMemo` + seçicilər) |
Ölçmə: Playwright + `web-vitals`, CI-da Lighthouse CI (performance ≥ 90, a11y ≥ 95, best practices ≥ 95).

---

## 12. Dizayn sistemi v2

### 12.1 Tokenlər (`src/styles/tokens.css`)
v1 tokenləri saxlanır (`CLAUDE.md §8`) və genişlənir:
- **Rənglər (açıq / tünd):** `--bg #F4F4F7 / #0B0C14`, `--surface #FFFFFF / #12141F`, `--surface-2 #F8F8FA / #181B28`, `--text #11131C / #EDEEF3`, `--text-2 #3D4152 / #B9BCCB`, `--muted #737789 / #8A8EA0`, `--border #E6E6EC / #262A3A`, `--ink #090A13` (menyu, hər iki rejimdə), `--grad` (dəyişmir).
- **Status (yalnız yük/vəziyyət, həmişə ikonla):** good `#0ca30c`, warning `#fab219`, critical `#d03b3b` (tünd rejimdə də eyni, fon kontrastı yoxlanır).
- **Qrafik kateqoriyaları** (validatordan keçib — `dataviz` skill-in `validate_palette.js`, 2026-11-19):
  - Açıq: `#2347A8, #F2501E, #12A39A, #7B5CD6, #C2378A, #8A6A00` (səth `#fcfcfb`; bütün yoxlamalar PASS, ən pis CVD ΔE 12,6).
  - Tünd: `#4A7DE3, #EC6430, #1A9E92, #8A73E3, #CC4F94, #A88312` (səth `#12141F`; PASS, ən pis CVD ΔE 12,7).
  - Sabit sıra; 7-ci seriya yaranmır → "Digər". Şirkət rəngləri varlığa bağlı: Birbank `#E30613` (tünddə `#FF4D57`), Pashapay = slot 1. Fəaliyyət forması: Administrativ = neytral `#5B6478`, Project and AdHoc = slot 2.
  - **Ardıcıl (heatmap):** narıncı, açıqdan tünd: `#FFF1E8 → #FFC9A8 → #FF9A66 → #F2501E → #A8300B`. **Divergent** (Δ müqayisələr): mavi `#2347A8` ↔ neytral `#E6E6EC` ↔ narıncı `#F2501E`.
  - Yeni palitra əlavə ediləndə validatoru yenidən işlət və nəticəni PR-a yaz.
- **Tipoqrafiya:** Inter; ölçülər 12/13/14/16/20/24/32/40; çəkilər 400/500/600/700/800; rəqəmlər `tabular-nums`.
- **Aralıq:** 4 px şkala (4, 8, 12, 16, 20, 24, 32, 40, 56). **Radius:** 8 / 12 / 16 / 22. **Kölgə:** 3 səviyyə.
- **Hərəkət:** 150–220 ms, `cubic-bezier(.2,.8,.2,1)`; `prefers-reduced-motion`-da söndürülür; qrafik animasiyası yalnız ilk render.

### 12.2 Qrafik qaydaları (bütün qrafiklər)
- Bir qrafik — bir ox (ikinci y oxu **qadağandır**); fərqli ölçülər → ayrı qrafiklər.
- ≥ 2 seriya → legend; ≤ 4 seriya → həm də birbaşa etiket. Rəng tək məna daşıyıcısı deyil (ikon, naxış, etiket).
- Mətnlər mətn rəngində (seriya rəngində yox). Grid xətləri zəif (`--border`), ox xətləri yox.
- Hover: bar/nöqtə üçün tooltip, xətt üçün crosshair; hit sahəsi işarədən böyük. Klavyatura ilə fokuslanan nöqtələr (ECharts `aria`).
- Boş data → boş vəziyyət mətni (heç vaxt boş ox).
- Hər qrafik ECharts `aria.enabled` + "Cədvəl kimi bax".
- Tünd rejim ayrıca tema (`charts/theme.ts`: `light`, `dark`), avtomatik çevirmə yox.

### 12.3 Komponentlər
Button (primary=qradiyent, secondary, ghost, danger, success; ölçülər sm/md), IconButton (tooltip məcburi), Input, Select (axtarışlı), Combobox (icraçı seçimi: ad + yük çipi), Checkbox, Switch, SegmentedControl, Chip/Badge (status rəngləri), Card, KpiCard, HeroStat, Sparkline, Drawer, Modal (fokus tələsi), Toast (geri al düyməsi ilə), Tooltip, Popover, Tabs, Breadcrumb, EmptyState, Skeleton, DataTable, ChartFrame (başlıq, ⓘ, menyu, tam ekran, cədvəl görünüşü), CommandPalette, NotificationCenter, Avatar (baş hərf; yükə görə halqa rəngi).
Hamısı: klaviatura, fokus görünüşü (`:focus-visible` 2 px narıncı halqa), ARIA, RTL tələb olunmur.

### 12.4 i18n
`shared/i18n/az.ts` əsas; `en.ts` tam tərcümə. Açarlar tip-təhlükəsiz. Data dəyərləri (proses adları) tərcümə olunmur. Tarix formatı `dd.MM.yyyy`, saat `HH:mm` (Bakı, UTC+4).

### 12.5 Əlçatanlıq (WCAG 2.2 AA)
Kontrast ≥ 4,5:1 mətn, ≥ 3:1 qrafik elementləri; bütün funksiyalar klaviatura ilə; skip-link; modal/drawer fokus idarəsi; ekran oxuyucu üçün qrafik xülasələri (`aria-describedby` avtomatik mətn); hərəkət azaldılması; toxunma hədəfi ≥ 44 px (mobil).

---

## 13. Keyfiyyət və testlər

### 13.1 Səviyyələr
- **Unit (Vitest):** `shared/metrics`, `shared/rebalance`, `shared/apply` (ssenari), import parsing, diffOps, formatlayıcılar, hər qrafik option funksiyası (snapshot test). Örtük ≥ 90% `shared/`.
- **Server (Vitest + mock Firestore):** hər endpoint, RBAC matrisi, versiya ziddiyyəti, rate limit, miqrasiya idempotentliyi, cron.
- **E2E (Playwright, mock server):** v1 `dev/e2e.py` ssenariləri TS-ə köçürülür + yeni: rollar, ssenari yarat→müqayisə→tətbiq→geri al, import sehrbazı, data sağlamlığı birləşdirmə, offline növbə, iki istifadəçi ziddiyyəti, hesabat çapı (PDF səhifə sayı).
- **Vizual reqressiya:** Playwright ekran şəkilləri 1440 / 820 / 390 px, açıq/tünd, əsas ekranlar; fərq ≥ 0,1% → PR-da baxış.
- **A11y:** `@axe-core/playwright` hər əsas ekranda — 0 ciddi pozuntu.

### 13.2 Qızıl rəqəmlər (seed data, `tests/golden/seed.test.ts`)
| Göstərici | Gözlənilən |
|---|---|
| Tapşırıq sayı | 341 (Birbank 266, Pashapay 75) |
| Əməkdaş sayı | 23 |
| Aktiv tapşırıq | 330 |
| İllik iş həcmi (aktiv) | 27 849,56 saat (ekranda 27 850) |
| Bütün tapşırıqların saatı | 28 782,14 |
| Lazım olan FTE | 14,49 (27 849,56 ÷ 1922) |
| Mövcud FTE | 18,0 (18 nəfər) |
| Norması aşanlar | 3: Ülkər ≈113%, Sveta x ≈113%, Ağaəli ≈106% |
| Ləğvdən qənaət | 932,58 saat (ekranda 933), 11 iş |
| Transfer (aktiv) | 121 |
| Optimizasiya potensialı | 55 saat |
| Şirkət bölgüsü (aktiv saat, yuvarlaq) | Birbank 21 014 · Pashapay 6 836 |
| Fəaliyyət forması | Administrativ 23 899 · Project and AdHoc 3 951 |
Bu rəqəmlər v1-in canlı panelindən götürülüb və `data/seed.json`-dan müstəqil hesablama ilə təsdiqlənib (2026-11-19). Canlı bazada sonradan edilən dəyişikliklər bu testə təsir etmir — test həmişə `seed.json` üzərində işləyir. Mərhələ 1-də `tests/golden/seed.test.ts` bu dəyərləri v1 formulalarının (`CLAUDE.md §5`) birbaşa TS köçürməsi ilə yoxlayır; Mərhələ 2-dən etibarən eyni test `shared/metrics.ts`-ə qarşı işləyir və heç vaxt silinmir.

### 13.3 CI (GitHub Actions, `.github/workflows/ci.yml`)
PR və `main` push-da: `npm ci` → `typecheck` → `lint` → `test` (unit+server) → `build` → `e2e` (mock server, Chromium) → Lighthouse CI → artefakt (ekran şəkilləri, hesabat). `main` qırmızıdırsa yeni iş başlamır.

---

## 14. Əməliyyat

- **Vercel Cron** (`vercel.json → crons`): `/api/cron/daily` gündə 1 dəfə (19:50 UTC; pulsuz planda icra vaxtı saat daxilində dəyişə bilər — snapshot tarixi icra anına görə deyil, Bakı vaxtı ilə "bu gün"ə yazılır, eyni gün təkrar işləsə üzərinə yazır): snapshot (§7.10) + backup (gzip JSON, `backups/YYYY-MM-DD`, 30 gündən köhnələr silinir) + tombstone təmizliyi (90 gündən köhnə `_deleted`, bütün klientlərin `lastTs`-i ondan yenidirsə; əks halda klient tam yükləmə edir — `since` 90 gündən köhnədirsə server `full` qaytarır).
- **Health:** `/api/health` → `{version, commit, env, firestore:'ok'|'error', lastSnapshot, lastBackup, schema_version}`.
- **Xəta izləmə:** klient xətaları `POST /api/client-error` → `log` kolleksiyasına deyil, `errors` kolleksiyasına (30 gün), Ayarlar → Texniki xidmətdə siyahı. Xarici xidmət yoxdur.
- **Versiya:** UI-da altda `v2.x.y · commit`; yeni deploy aşkarlananda (health `commit` dəyişib) "Yeni versiya var — yenilə" toast.
- **Bərpa planı:** backup-dan bərpa (Ayarlar), Vercel-də əvvəlki deploy-a "Promote" (sahibə yazılı təlimat README-də).

---

## 15. Miqrasiya planı (v1 → v2)

1. `v2` branch-da yeni struktur; v1 `public/` toxunulmaz qalır, ikisi paralel build olunmur.
2. API geriyə uyğun: v2 serveri v1 klientinin bütün sorğularını qəbul edir (keçid dövründə köhnə açıq tablar sınmasın).
3. Firestore sxemi additiv (§4.5) — v1 klienti yeni sahələri görməzdən gəlir, silmir (v1 `diffOps` yalnız öz sahələrini göndərir, amma **tam sənədi əvəz edir** → v2 sahələri silinər!). **Həll:** v2 deploy-u ilə eyni anda server `upsert`-də `updateMask` ilə yalnız göndərilən sahələri yazmağa keçir (v1 klienti üçün də təhlükəsiz). Bu dəyişiklik **Mərhələ 1-də**, ən əvvəl edilir.
4. Miqrasiya skripti (§4.5) admin tərəfindən; əvvəl backup.
5. Keçiddən sonra 7 gün `public/`-i `legacy/` kimi saxla (`/legacy` marşrutu), sonra sil.

---

## 16. Mərhələlər

Hər mərhələ: branch, PR, CI yaşıl, QM-lər yoxlanıb, sahibə ekran şəkilləri ilə xülasə, sonra `main`.

| # | Mərhələ | Nəticə | Əsas QM |
|---|---|---|---|
| 1 | **Təməl** | Vite+React+TS skeleti, tokenlər, shell (menyu, üst panel), login, `server/` TS-ə köçürmə, `updateMask` düzəlişi (§15.3), Zod sxemləri, mock server TS, CI, qızıl testlər v1 məntiqinə qarşı | CI yaşıl; canlı sayt v1 ilə işləyir; qızıl testlər keçir |
| 2 | **Data qatı** | Zustand store, sync mühərriki (v1 davranışı + `_v` ziddiyyət + IndexedDB + offline növbə), undo/redo, `shared/metrics.ts` | Qızıl rəqəmlər v2 ilə; iki istifadəçi ziddiyyəti e2e |
| 3 | **Tapşırıqlar + Əməkdaşlar** | Data grid, drawer, profil səhifəsi, ötürmə/ləğv/toplu, sətirdə redaktə, komanda paleti | v1 e2e ssenariləri v2-də keçir |
| 4 | **Panel** | §6.2 bütün vidjetlər, ECharts temaları, "Cədvəl kimi bax", tünd rejim | Vizual testlər; a11y 0 ciddi |
| 5 | **Rollar + təhlükəsizlik** | RBAC, sessiya versiyası, kilid, məcburi parol dəyişmə, CSP, audit | RBAC matrisi testləri |
| 6 | **Ssenarilər + Balanslama** | §6.5, §8, təsdiq axını, bildirişlər | Ssenari canlı dataya yazmır (test) |
| 7 | **Optimizasiya + Data sağlamlığı** | §6.6, §6.8 | Seed tapıntıları aşkarlanır |
| 8 | **Hesabatlar + Excel v2** | §6.7, §9 | PDF 2–4 səhifə, import diff önizləmə |
| 9 | **Əməliyyat** | Cron (snapshot, backup, təmizlik), trend vidjetləri, health v2, xəta izləmə, PWA | Cron lokal testdə; backup→bərpa e2e |
| 10 | **Keçid** | Miqrasiya skripti, v1 → v2 keçidi, `legacy/`, README/CLAUDE.md yeniləmə, sahibə təlimat | Canlıda qızıl rəqəmlər eyni; Lighthouse hədəfləri |

---

## 17. "Hazırdır" (Definition of Done) — hər PR üçün

- [ ] Typecheck, lint, unit, e2e, vizual testlər yaşıl; yeni məntiq üçün test var.
- [ ] Bütün yeni mətnlər `az.ts` və `en.ts`-də; hardcode mətn yoxdur.
- [ ] Yüklənir / boş / xəta / offline vəziyyətləri var.
- [ ] Klaviatura ilə işləyir; axe 0 ciddi; kontrast yoxlanıb.
- [ ] 1440 / 820 / 390 px, açıq/tünd ekran şəkilləri PR-da.
- [ ] Firestore oxuma/yazma təsiri qiymətləndirilib (PR təsvirində).
- [ ] Rəqəm formulası dəyişibsə — sahibin razılığı və `§7` yenilənib.
- [ ] `CLAUDE.md` / `SPEC.md` / `docs/` lazım olduqda yenilənib.
- [ ] Sirr commit olunmayıb; yeni env dəyişəni varsa sahibə addım-addım təlimat.

---

## 18. Açıq suallar (default cavablarla — iş dayanmır)

| # | Sual | Default (sahib dəyişməsə) |
|---|---|---|
| S1 | Təsdiq axını lazımdırmı? | Söndürülü |
| S2 | Rəhbərlik (viewer) üçün ayrıca hesablar? | Bəli, sahib yaradacaq |
| S3 | Balanslamada şirkətlərarası ötürməyə icazə? | Xeyr |
| S4 | 2027 norması? | Hələ yoxdur; Ayarlarda daxil ediləndə istifadə olunur, yoxdursa 1922 |
| S5 | Ad dublikatları (Farida/Fəridə, Kamila/Kamilə) birləşdirilsinmi? | Data sağlamlığında təklif olunur, avtomatik birləşdirilmir |
| S6 | `P-29` saatı 200 yoxsa 40? | 200 saxlanır, xəbərdarlıq göstərilir |
| S7 | İngilis dili lazımdırmı? | Bəli, ikinci dil (az default) |
| S8 | Real-time (Firebase Auth) açılsın? | Xeyr, 10 s delta kifayətdir |
| S9 | Saat dəyəri (AZN) ilə maliyyə təhlili? | v3 |
