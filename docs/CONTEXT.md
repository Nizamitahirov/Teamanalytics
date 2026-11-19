# Layihənin konteksti: tarixçə, qərarlar, data

Bu sənəd layihənin necə yarandığını, hansı qərarların niyə verildiyini və datanın haradan gəldiyini izah edir. Kodu dəyişməzdən əvvəl "niyə belədir?" sualının cavabı buradadır.

## 1. Sahibin məqsədi (öz sözləri ilə, xülasə)

- Şöbənin prosesləri Excel/Google Sheet-də idi; hər dəfə rəhbərliyə təqdim üçün sheet-i redaktə edib vizuallaşdırmaq çətin idi.
- İstək: işləri **bir əməkdaşdan digərinə rahat ötürmək, ləğv etmək** və s. — "workforce planning kimi düşün". Əsas məsələ prosesin **idarəetmə** hissəsidir.
- İllik iş norması: ölkə üzrə 2026-cı il üçün **1922 saat** (5 günlük iş həftəsi).
- Rəhbərlik üçün **analiz paneli**; Excel export/import mütləqdir.
- Dizayn: **Birbank stilistikası, qırmızı→narıncı qradiyent**, jabr.az-dan ilham.
- Sürətli və "dinamik" (bir nəfərin dəyişikliyi digərlərində görünsün) olmalıdır.
- Giriş ad/parol ilə; istifadəçilər **Firebase**-də saxlanılsın. İlk istifadəçi: `Ecosystem` / `Ecosystem`.
- Sahibdən mümkün qədər az addım tələb olunsun ("mən heç nə etməyim"); dəyişikliklər birbaşa `main`-ə.

## 2. Data mənşəyi

İki cədvəl birləşdirilib (`data/seed.json`):

| Mənbə | Şirkət | Sətir | ID | Xüsusiyyət |
|---|---|---|---|---|
| Cədvəl 1 (Əmək Münasibətləri, Birbank) | Birbank | 266 | `B-<orijinal id>` | `frequency` mətn idi ("24 say", "624 keys", "İldə 1 dəfə") → `annual_freq` + `unit`; `hours` illik saat; `is_cancelled`; `description` |
| Cədvəl 2 (Pashapay) | Pashapay | 75 | `P-<orijinal id>` | `1 keys üçün dəqiqə` → `min_per_key`, `illik təkrarlanma` → `annual_freq`, `İllik sərf olunan vaxt` → `hours`, `Optimizasiyadan sonra` → `after_opt`; `owner_after` əksəriyyətdə boş |

Fəaliyyət forması qaydası (sahibin tələbi): Ağaəli, Aygül, İqrar, Aysel → **Project and AdHoc based**; qalanlar → **Administrativ**. Aygül və İqrar datada yoxdur, profil kimi əlavə olunub (tapşırıqsız).

### Data keyfiyyəti problemləri (sahibə bildirilib, həll edilməyib — v2-də "Data sağlamlığı" bölməsi)

1. **Təkrar sətir:** `B-1770271295121` ("Şöbənin büdcə planlaması", Orxan→Aysel, 24 saat, ləğv) `B-44` ilə eynidir. Qeyd sahəsində işarələnib. Hesablamalarda iki dəfə sayılır (ləğv olunduğu üçün aktiv saata təsiri yoxdur, "Ləğvdən qənaət"ə 24 saat artıq düşür).
2. **Ad dublikatları:** `Farida` (Pashapay) / `Fəridə` (Birbank); `Kamila` / `Kamilə` (Pashapay daxilində, `P-20` Amortizasiya əmri İlahə→Kamilə). Çox güman eyni şəxslərdir. Əməkdaş profilində adı dəyişib birləşdirmək mümkündür — sahib hələ etməyib.
3. **ID-siz sətir:** Pashapay-da İlahə, "Struktur dəyişikliyi" → `P-x71` id verilib; `P-71` (Kamila) ilə eyni işdir.
4. **Saat uyğunsuzluğu:** `P-29` İntizam tənbehi əmrləri: 120 dəq × 20 = 40 saat olmalıdır, mənbədə 200 saat. Dəyişdirilməyib, qeyd sahəsində işarələnib.
5. **"x" suffiksi** (Aida x, Sveta x, Elmira x...) mənbədə belədir; mənası naməlumdur (ehtimal: ayrılmış/xarici). Toxunulmayıb.
6. Cədvəl 1-də `owner_before = owner_after` olan sətirlər "Mövcud", fərqli olanlar "Transfer" — ilkin "transfer statusu" sahibin ilk sualında da bu idi (ayrıca status sütunu yox idi).

Başlanğıc rəqəmləri (yoxlama üçün): 341 tapşırıq, aktiv illik iş həcmi **27 850 saat** → **14,5 FTE** lazım; mövcud 18 nəfər; norması aşan 3 nəfər (Ülkər 113%, Sveta x 113%, Ağaəli 106%); ləğvdən qənaət 933 saat (11 iş); transfer 121; optimizasiya potensialı 55 saat. Bütün cədvəllərin cəmi 28 782,14 saat.

## 3. Tarixçə (PR-lar)

| # | Nə | Niyə |
|---|---|---|
| ilkin | `index.html` + Google Apps Script → köhnə Sheet; analitika "2025" parolu ilə (client-side) | Sahibin əvvəlki versiyası |
| #1–#3 | Tam platforma (panel, əməkdaşlar, tapşırıqlar, jurnal, Excel, undo); əvvəl localStorage + Apps Script, sonra Vercel + Google Sheets API + login | Workforce planning tələbi; client-side parol təhlükəsiz olmadığı üçün çıxarıldı |
| #4 | Google Sheet → **Firestore**; delta sinxron; Firestore-da istifadəçilər; avtomatik seed; dizayn düzəlişləri; lokal vendor | Sürət, real vaxta yaxın sinxron, eyni vaxtda redaktə etibarlılığı; sahib Firebase layihəsi yaratdı |
| #5 | `/api/health`, mühit dəyişəni adına dözümlülük | Vercel-də dəyişən görünmürdü — səbəbi Redeploy-un dəyişəndən əvvəl edilməsi idi |
| sonra | `CLAUDE.md`, bu sənəd, `SPEC.md`, `dev/` test mühiti | Layihəni Claude Code ilə davam etdirmək üçün |

## 4. Əsas qərarlar (ADR xülasəsi)

1. **Google Sheet əvəzinə Firestore.** Sheet: yazma 0,5–1,5 s, 20 s polling, "replace" ilə ziddiyyət riski. Firestore: atomik commit, `_ts` ilə ucuz delta. Əvəzində "cədvəldə birbaşa düzəliş" imkanı itdi → Excel export/import bunu əvəz edir.
2. **Brauzer Firestore-a birbaşa qoşulmur.** Firebase Auth + təhlükəsizlik qaydaları sahibdən konsol addımları tələb edirdi; server-only REST ilə Vercel-də **tək mühit dəyişəni** kifayət edir və qaydalar "hamıya bağlı" qala bilir.
3. **Real-time əvəzinə 10 s delta yoxlama.** `meta/main.updated` 1 oxuma ilə dəyişiklik olub-olmadığını göstərir; pulsuz limit (50k oxuma/gün) daxilində qalır.
4. **Yalnız dəyişən sənədlər yazılır.** v1-də böyük import bütün vərəqi lokal nüsxə ilə əvəz edirdi və başqa istifadəçinin "geri al"ını silirdi (testdə tapıldı). İndi hər əməliyyat diff-dir; import/export əvvəl serverdən yenilənir.
5. **Yumşaq silmə.** Delta sinxronda silinməni digər klientlərə çatdırmaq üçün.
6. **Build-siz frontend (v1).** Sürətli çatdırılma və sahibin heç nə quraşdırmaması üçün. v2-də (SPEC) Vite + TypeScript-ə keçid planlaşdırılıb.
7. **Kitabxanalar lokal (vendor).** Korporativ şəbəkələrdə CDN bloklana bilər; Google Fonts/cdnjs asılılığı çıxarıldı. SheetJS yalnız Excel düyməsində CDN-dən (npm versiyası köhnədir).
8. **Sessiya açarı service account açarından törədilir** — ayrıca `AUTH_SECRET` tələb etməmək üçün.
9. **Public repo:** sirlər yalnız Vercel mühit dəyişənində.

## 5. Yoxlanmış vəziyyət (2026-11-19)

Canlı saytda (`d635dcc`): `/api/health` → production, `FIREBASE_SERVICE_ACCOUNT` görünür (`worforce-74ddf`); `Ecosystem` girişi işləyir; ilk açılışda seed yazıldı (341/23); yazma ~1,2 s, delta ~1,4 s, "dəyişiklik yoxdur" yoxlaması ~0,35 s; brauzer konsolunda xəta yoxdur. Test zamanı `B-35` yazılıb geri qaytarılıb (yalnız `updated_at/updated_by` dəyişib).

## 6. Sahibə verilmiş, hələ icra olunmamış tövsiyələr

- `Ecosystem` parolunu dəyişmək və komanda üçün ayrı istifadəçilər yaratmaq (jurnalda kim nə etdi aydın olsun).
- Service account açarı söhbətdə paylaşıldığı üçün Firebase-də yeni açar yaradıb köhnəsini (`67d3a5c8…`) silmək, Vercel-də dəyişəni yeniləmək.
- Ad dublikatlarını birləşdirmək (Farida/Fəridə, Kamila/Kamilə) və `P-29` saatını yoxlamaq.
