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

Build addımı **yoxdur** (v1). Vercel `public/`-i statik, `api/*.js`-i Node serverless funksiya kimi yayımlayır.

```
public/                 Brauzer (statik)
  index.html            Tətbiqin qabığı: sol menyu, 5 bölmə (Panel, Əməkdaşlar, Tapşırıqlar, Jurnal, Ayarlar), modal, drawer
  login.html            Giriş səhifəsi (öz daxili CSS-i ilə)
  app.js                BÜTÜN klient məntiqi (~1080 sətir, IIFE, vanilla JS, innerHTML render)
  styles.css            Dizayn sistemi (CSS dəyişənləri, responsive: 1300/1200/900/700/560 px)
  vendor/               Lokal kitabxanalar: Inter şrifti, Font Awesome 6.5.2 (yalnız solid), Chart.js 4.4.4
api/                    Vercel funksiyaları (ESM, Node ≥ 20)
  login.js  logout.js   Sessiya cookie-si (POST)
  data.js               GET: tam yükləmə və ya ?since=TS ilə delta; baza boşdursa seed yazır
  ops.js                POST: dəyişiklik partiyası {ops:[...]}
  log.js                GET: bütün jurnal (Excel export üçün)
  users.js              GET/POST: istifadəçi idarəsi (add | password | remove)
  health.js             GET: diaqnostika (auth tələb etmir, gizli dəyər göstərmir)
lib/
  firestore.js          Firestore REST klienti (service account JWT → OAuth token), oxuma/yazma/delta/seed/users
  auth.js               PBKDF2 parol, HMAC imzalı sessiya cookie-si
  http.js               requireUser, send, body, fail
data/seed.json          İlkin data: 341 tapşırıq + 23 əməkdaş (ictimai deyil, yalnız serverdə oxunur)
dev/mock-server.mjs     Lokal server: Vercel + Firestore REST mock (yaddaşda)
dev/e2e.py              Playwright uçdan-uca test
docs/CONTEXT.md         Tarixçə, qərarlar, data keyfiyyəti
SPEC.md                 v2 spesifikasiyası (növbəti böyük iş)
```

## 3. Əmrlər

```bash
npm run dev      # http://localhost:8765 — mock Firestore ilə tam tətbiq (giriş: Ecosystem / Ecosystem)
                 # http://localhost:8791 — mock bazanın JSON görüntüsü + API çağırış siyahısı
npm run check    # sintaksis + server modullarının import yoxlaması
npm run e2e      # Playwright testi (dev server işləyərkən; pip install playwright && playwright install chromium)
                 # XLSX_PATH=/path/xlsx.full.min.js — CDN əlçatmazdırsa Excel testi üçün
```

- e2e testi **təmiz mock baza** gözləyir: hər qaçışdan əvvəl `npm run dev`-i yenidən başlat.
- Mock server real Firebase-ə qoşulmur: `FIRESTORE_API_BASE` və `FIRESTORE_FAKE_TOKEN` mühit dəyişənləri ilə `lib/firestore.js`-i öz mock-una yönəldir.
- Sandbox/CI mühitində çox vaxt `*.googleapis.com` bağlıdır — real Firebase-i yalnız canlı saytda (`/api/health`, brauzer) yoxlamaq olar.

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
| `tasks` | `id` (məs. `B-25`, `P-17`, `T-…`) | `id, company, process, category, task, description, owner_before, owner_after, min_per_key, annual_freq, unit, hours, after_opt, is_cancelled, updated_at, updated_by` + sistem: `_ts`, `_deleted` |
| `employees` | `name` (dəqiq ad, məs. `Şöbə əməkdaşları`) | `name, company, activity, fte, is_group, active` + `_ts`, `_deleted` |
| `log` | klientin yaratdığı `L-…` id | `ts, user, action, task_id, task_label, from, to, comment` + `_ts` |
| `meta/main` | tək sənəd | `updated` (son commit vaxtı), `norm`, `warn` (ayarlar) |
| `users` | ad kiçik hərflə (`ecosystem`) | `name, salt, hash, iter, active, created_by` — **heç vaxt klientə göndərilmir** |

- `_ts`: hər yazmada server vaxtı (`REQUEST_TIME` transform). Delta sinxronun əsası.
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

1. **Açılış:** `localStorage['wfp.cache.v2']` = `{me, lastTs, state}` dərhal render olunur, sonra `/api/data?since=lastTs`.
2. **Dəyişiklik** (`commit(label, mutator, logs)`): snapshot → mutator lokal state-i dəyişir → render → `diffOps(prev, state)` yalnız dəyişən sənədlər üçün `upsert`/`delete` əməliyyatları yaradır → növbəyə (`queue`) → `flush()` ardıcıl `POST /api/ops` (1 təkrar cəhd, uğursuzluqda tam yenidən yükləmə).
3. **Server** (`applyOps`): hamısı bir `:commit` (≤450 yazma/hissə) + `meta/main.updated` yenilənir.
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
- Dəyişiklikdən əvvəl: `npm run check`; məntiq dəyişibsə `npm run dev` + `npm run e2e`. UI dəyişibsə 1440, 820 və 390 px enində ekran şəkli ilə bax.
- Rəhbərliyə gedən rəqəmlərin hesablanma qaydasını (bölmə 5) sahibin razılığı olmadan dəyişmə.
- Commit mesajları azərbaycanca; sonunda layihənin standart `Co-Authored-By` sətri.

## 10. Bilinən problemlər / texniki borc

- `app.js` tək fayl, `innerHTML` ilə tam yenidən render; hər dəyişiklikdə bütün aktiv bölmə yenidən çəkilir (341 sətirdə problem deyil, 5 000+ sətirdə yavaşlayacaq).
- Rəqəm formatı `toLocaleString('az-AZ')` — bəzi brauzerlərdə az-AZ ICU yoxdursa `27,850` kimi görünür.
- Tombstone-lar və jurnal sonsuz böyüyür; arxivləmə yoxdur.
- `applyOps` `upsert`-də **tam sənədi əvəz edir** (`updateMask` yoxdur): Firestore konsolunda və ya gələcək versiyada əlavə olunan sahələr klientin növbəti yazmasında silinir. SPEC §15.3 — v2-də ilk düzəliş.
- Rollar yoxdur: hər istifadəçi hər şeyi edə, istifadəçi silə bilər.
- Tarixi snapshot yoxdur → trend qrafikləri mümkün deyil.
- Data keyfiyyəti: ad dublikatları (Farida/Fəridə, Kamila/Kamilə), təkrar sətir (`B-1770271295121` = `B-44`), id-siz sətir (`P-x71`), `P-29`-da saat uyğunsuzluğu — ətraflı `docs/CONTEXT.md`.
- Bütün bunlar `SPEC.md`-də həll olunur.
