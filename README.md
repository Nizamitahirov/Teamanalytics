# Workforce Planning — Əmək Münasibətləri

Şöbənin proseslərini, tapşırıqlarını və iş yükünü idarə etmək üçün veb platforma. Vercel-də işləyir, məlumatlar Firebase Firestore-da saxlanır, giriş ad və parolla olur.

## İmkanlar

- **Panel**: illik iş həcmi, lazım olan və mövcud ştat (norma 1922 saat), ehtiyat/çatışmazlıq, normanı aşanlar, ləğvdən qənaət, optimizasiya potensialı. Əməkdaşların yük qrafiki, ötürmələrdən əvvəl/indi müqayisəsi, şirkət / fəaliyyət forması / status bölgüsü, proses və kateqoriya üzrə saatlar, ştat cədvəli.
- **Əməkdaşlar**: yük kartları. Tapşırıqları ötürmək (qəbul edənin yükü əvvəlcədən göstərilir), ləğv, bərpa, "Hamısını ötür". Profil: şirkət, fəaliyyət forması, ştat (0.5 və s.), qrup. Adları birləşdirmək (məs. "Kamilə" → "Kamila").
- **Tapşırıqlar**: axtarış, filtrlər, sıralama, toplu ötürmə / ləğv / bərpa / silmə.
- **Jurnal**: hər əməliyyat — kim, nə vaxt, kimdən → kimə, şərh.
- **Geri al** (son 30 əməliyyat, Ctrl+Z), **Excel export** (4 vərəq) və **import** (yenilə / əvəz et).
- **İstifadəçilər**: Ayarlar bölməsindən əlavə etmək, parol dəyişmək, silmək. Jurnalda hər əməliyyatı kimin etdiyi görünür.

## Necə sürətli işləyir

- Dəyişiklik ekranda **dərhal** görünür, bazaya arxa planda yazılır (yan paneldə "Saxlanır… / Sinxron").
- Hər 10 saniyədə yalnız **bir kiçik sorğu** gedir: "son dəyişiklikdən sonra nə dəyişib?". Dəyişiklik yoxdursa, heç nə yüklənmir. Varsa, yalnız dəyişən tapşırıqlar gəlir.
- Brauzer son nüsxəni yadda saxlayır: səhifə dərhal açılır, sonra yalnız fərq yüklənir.
- Firestore-un pulsuz limiti (gündə 50 000 oxuma, 20 000 yazma) bu həcm üçün kifayətdir.

---

## Quraşdırma

Vercel-də **yalnız bir** mühit dəyişəni lazımdır:

| Ad | Dəyər |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase → Project settings → Service accounts → *Generate new private key* ilə yüklənən JSON faylının **bütün məzmunu** |

Vercel → layihə → **Settings → Environment Variables** → əlavə edin (Production, Preview, Development) → **Deployments → ⋯ → Redeploy**.

Qalanı avtomatikdir:
- **Giriş**: ilk istifadəçi `Ecosystem` / `Ecosystem` ilk girişdə Firestore-un `users` kolleksiyasında yaranır. Yeni istifadəçi və parol dəyişikliyi: **Ayarlar → İstifadəçilər**. Parollar PBKDF2 heşi kimi saxlanır.
- **İlkin məlumatlar**: baza boşdursa, ilk açılışda 341 tapşırıq və 23 əməkdaş yazılır.
- **Sessiya açarı** service account açarından törədilir (istəsəniz `AUTH_SECRET` ilə öz açarınızı verə bilərsiniz).
- Firestore qaydalarını dəyişmək və Firebase Authentication-ı açmaq lazım deyil: brauzer bazaya birbaşa qoşulmur.
- `FIRESTORE_DATABASE` — yalnız bazanın ID-si `(default)` deyilsə.

> Service account JSON faylı layihəyə tam giriş verir: onu GitHub-a yükləməyin, mesajla göndərməyin. Fayl başqasına düşübsə, Firebase-də yeni açar yaradın, köhnəsini Google Cloud → IAM → Service accounts → Keys bölməsində silin və Vercel-də dəyişəni yeniləyin.

---

## Claude Code ilə davam etmək üçün

- `CLAUDE.md` — layihənin işçi təlimatı (arxitektura, məlumat modeli, biznes qaydaları, sinxron axını, əmrlər, qaydalar).
- `docs/CONTEXT.md` — tarixçə, qərarların səbəbləri, datanın mənşəyi və keyfiyyət problemləri.
- `SPEC.md` — v2 spesifikasiyası (növbəti böyük iş: React + TypeScript, ECharts paneli, ssenarilər, rollar, hesabatlar).
- Lokal işləmək: `npm run dev` (mock Firestore, `Ecosystem / Ecosystem`), test: `npm run e2e`.

## Fayllar

```
public/            Səhifələr (index.html, login.html, app.js, styles.css)
api/               Server funksiyaları: login, logout, data, ops, log, users
lib/auth.js        Giriş (Firestore users, PBKDF2) və sessiya (HMAC imzalı cookie, 12 saat)
lib/firestore.js   Firestore REST API (service account), dəyişiklik izləmə
public/vendor/     Şrift, ikonlar və Chart.js — CDN-siz, sürətli
dev/               Lokal mock server və e2e test
docs/              Kontekst və qərarlar
data/seed.json     İlkin məlumatlar (Birbank 266 + Pashapay 75) — ictimai deyil
```

## Hesablama qaydaları

- **Cari icraçı** = yeni icraçı, boşdursa ilkin icraçı.
- **Status**: Ləğv · Transfer (ilkin və yeni icraçı fərqlidir) · Yeni (ilkin icraçı yoxdur) · Mövcud.
- **Yük** = aktiv tapşırıqların illik saatı ÷ (norma × ştat). Ləğv edilmiş işlər daxil deyil.
- **Lazım olan ştat** = aktiv illik saat ÷ norma. **Mövcud ştat** = tapşırığı olan fərdi əməkdaşların ştatlarının cəmi.
- **Fəaliyyət forması** əməkdaşın profilindən gəlir. Başlanğıcda Ağaəli, Aygül, İqrar, Aysel → *Project and AdHoc based*, qalanlar → *Administrativ*.
- "Şöbə əməkdaşları" **qrup**dur: saatları cəmə daxildir, fərdi yükə və mövcud ştata düşmür.
