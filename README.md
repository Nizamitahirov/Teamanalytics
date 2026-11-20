# Workforce Planning — Əmək Münasibətləri

Şöbənin bütün təkrarlanan işlərini (kim edir, ildə neçə dəfə, neçə saat) bir yerdə saxlayan, yükü normaya görə izləyən və rəhbərliyə hesabat hazırlayan veb platforma.

- **Sayt:** https://teamanalytics.vercel.app (yeni versiya, v2)
- **Köhnə versiya (ehtiyat):** https://teamanalytics.vercel.app/legacy/ — eyni məlumatlar, eyni giriş
- Telefonda və ya kompüterdə "Ana ekrana əlavə et" ilə tətbiq kimi quraşdırmaq olar; internet olmadıqda son yüklənmiş məlumat görünür.

## Bölmələr

| Bölmə | Nə üçün |
|---|---|
| **Panel** | İş həcmi, lazım olan / mövcud ştat, ehtiyat, normanı aşanlar, qrafiklər (yük, ötürmə axını, proseslər, ləğv və optimizasiya), ştat cədvəli, **trend** (gündəlik), data sağlamlığı xəbərdarlığı |
| **Əməkdaşlar** | Yük kartları, profil, ötürmə, "Hamısını ötür", "Yükü balansla" |
| **Tapşırıqlar** | Cədvəl, axtarış (ə/e fərqi yoxdur), filtrlər, toplu ötürmə / ləğv / bərpa, sətirdə redaktə |
| **Ssenarilər** | "Nə olardı?" — canlı dataya toxunmadan dəyişiklikləri sınamaq (əməkdaş ayrılır, yeni əməkdaş, avtomatlaşdırma, normanı dəyiş, yükü balansla), cari ilə müqayisə, bir düymə ilə tətbiq və geri alma |
| **Optimizasiya** | Namizəd → İcrada → Tamamlandı lövhəsi, potensial və realizə olunmuş qənaət, rüblər üzrə plan/fakt |
| **Hesabatlar** | Rəhbərlik hesabatı (PDF, 4 səhifə), əməkdaş kartı, proses, jurnal, dövr müqayisəsi; Excel/CSV export, Excel import (önizləmə ilə) |
| **Data sağlamlığı** | Ad dublikatları, təkrar tapşırıqlar, saat uyğunsuzluğu, ID problemləri — düzəltmə düymələri ilə |
| **Jurnal** | Hər əməliyyat: kim, nə vaxt, nə dəyişdi |
| **Ayarlar** | Parol, norma və məzuniyyət, təsdiq axını, istifadəçilər, **Data** (backup / bərpa), **Texniki xidmət** |

Hər dəyişiklik ekranda dərhal görünür, arxa planda bazaya yazılır; **Geri al** (Ctrl+Z) son 30 addımı qaytarır. Eyni anda iki nəfər eyni işi dəyişərsə, hansı versiyanın qalacağını soruşur.

## Rollar

- **Administrator** — hər şey: istifadəçilər, ayarlar, data sağlamlığı düzəlişləri, backup-dan bərpa, təsdiq.
- **Redaktor** — tapşırıq və əməkdaşlarla işləmək, ötürmə, ssenarilər (təsdiq axını açıqdırsa — təsdiqə göndərir).
- **Baxış** — yalnız oxuma və hesabatlar (rəhbərlik üçün).

Yeni istifadəçi: **Ayarlar → İstifadəçilər → İstifadəçi əlavə et** (müvəqqəti parol; ilk girişdə öz parolunu təyin edir).

## Hesablama qaydaları

- **Effektiv norma** = illik norma − məzuniyyət: **1922 − 30 gün × 8 saat = 1682 saat / 1 ştat** (Ayarlar → Ümumi-dən dəyişir; Paneldə izahı yazılır).
- **Yük** = əməkdaşın aktiv işlərinin illik saatı ÷ (effektiv norma × ştat). 100%-dən çox — norma aşılır (qırmızı), 85%-dən çox — yüksək (sarı).
- **Lazım olan ştat** = bütün aktiv işlərin saatı ÷ effektiv norma. **Mövcud ştat** = aktiv işi olan əməkdaşların ştatlarının cəmi. **Ehtiyat** = mövcud − lazım.
- **Cari icraçı** = yeni icraçı, boşdursa ilkin icraçı. **Status**: Ləğv · Transfer · Yeni · Mövcud.
- **Ləğv** silmək deyil — saatı "Ləğvdən qənaət"ə düşür, istənilən vaxt bərpa olunur.
- "Şöbə əməkdaşları" **qrup**dur: saatı cəmə daxildir, fərdi yükə və mövcud ştata düşmür.

## Backup və bərpa

- Hər gün (Bakı vaxtı ~23:50) **avtomatik backup** və Panel rəqəmlərinin surəti (trend üçün) saxlanılır; backup-lar 30 gün qalır.
- **Ayarlar → Data**: backup siyahısı, "İndi backup et", **Önizlə və bərpa et** (nəyin dəyişəcəyini göstərir, iki dəfə təsdiq istəyir, əvvəlcə cari vəziyyətin backup-ını alır; bərpa da "Geri al" ilə qaytarılır).
- Excel ilə əlavə nüsxə: **Hesabatlar → Excel**.

## Problem olduqda

1. Brauzerdə açın: https://teamanalytics.vercel.app/api/health — `firestore: "ok"` olmalıdır; `commit` son yeniləmənin kodunu göstərir.
2. Yeni versiyada problem varsa, işi **köhnə versiyada** davam etdirin: https://teamanalytics.vercel.app/legacy/
3. **Əvvəlki versiyaya qayıtmaq (1 dəqiqə):** vercel.com → layihə **teamanalytics** → **Deployments** → əvvəlki (yaşıl "Ready") deploy-un yanındakı **⋯** → **Promote** → təsdiqlə. Məlumatlara təsir etmir.
4. Səhv dəyişiklik edilibsə: **Geri al**, ya da **Ayarlar → Data**-dan dünənki backup-a qayıdın.

## Quraşdırma (Vercel)

Vercel-də **bir məcburi** mühit dəyişəni lazımdır:

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


**Tövsiyə olunan (istəyə bağlı) — `CRON_SECRET`:** gündəlik backup-ı yalnız Vercel-in özü işlədə bilsin deyə.
1. vercel.com → **teamanalytics** → **Settings** → **Environment Variables**.
2. **Key:** `CRON_SECRET`, **Value:** istənilən uzun söz (məs. 30+ hərf və rəqəm, heç kimə göndərməyin), **Environments:** Production → **Save**.
3. **Deployments** → sonuncu deploy → **⋯** → **Redeploy**.
4. Yoxlama: Ayarlar → Texniki xidmət-də `CRON_SECRET: var`.

---

## Proqramçılar üçün

- `CLAUDE.md` — işçi təlimat (arxitektura, məlumat modeli, biznes qaydaları, sinxron axını, əmrlər). `SPEC.md` — v2 spesifikasiyası. `docs/ADR-*.md` — qərarlar, `docs/CONTEXT.md` — tarixçə.
- Lokal: `npm run dev` (API + mock Firestore + köhnə klient, http://localhost:8765) və `npm run dev:v2` (yeni klient, http://localhost:5173). Giriş: `Ecosystem / Ecosystem`.
- Yoxlama: `npm run ci` (typecheck, lint, format, testlər, build), `npm run e2e`, `npm run e2e:v1`.
- Deploy: `main`-ə push → Vercel `npm run build:vercel` (v2 → `dist/`, köhnə klient → `dist/legacy/`).

```
src/               v2 klienti (React + Vite) — canlıda
public/            v1 klienti — canlıda /legacy/ (ehtiyat)
api/               Server funksiyaları (TypeScript, 12)
server/            Firestore REST, giriş/sessiya, ssenarilər, gündəlik iş
shared/            Hesablamalar (metrics — tək mənbə), sxemlər, mətnlər (az/en)
dev/  tests/       Mock server, e2e və unit testlər, qızıl rəqəmlər
docs/              Kontekst və qərarlar (ADR)
data/seed.json     İlkin məlumatlar (Birbank 266 + Pashapay 75) — ictimai deyil
```
