# Workforce Planning — Əmək Münasibətləri

Şöbənin proseslərini, tapşırıqlarını və iş yükünü idarə etmək üçün veb platforma. Vercel-də işləyir, məlumatlar Firebase Firestore-da saxlanır, giriş ad və parolla olur.

## İmkanlar

- **Panel**: illik iş həcmi, lazım olan və mövcud ştat (norma 1922 saat), ehtiyat/çatışmazlıq, normanı aşanlar, ləğvdən qənaət, optimizasiya potensialı. Əməkdaşların yük qrafiki, ötürmələrdən əvvəl/indi müqayisəsi, şirkət / fəaliyyət forması / status bölgüsü, proses və kateqoriya üzrə saatlar, ştat cədvəli.
- **Əməkdaşlar**: yük kartları. Tapşırıqları ötürmək (qəbul edənin yükü əvvəlcədən göstərilir), ləğv, bərpa, "Hamısını ötür". Profil: şirkət, fəaliyyət forması, ştat (0.5 və s.), qrup. Adları birləşdirmək (məs. "Kamilə" → "Kamila").
- **Tapşırıqlar**: axtarış, filtrlər, sıralama, toplu ötürmə / ləğv / bərpa / silmə.
- **Jurnal**: hər əməliyyat — kim, nə vaxt, kimdən → kimə, şərh.
- **Geri al** (son 30 əməliyyat, Ctrl+Z), **Excel export** (4 vərəq) və **import** (yenilə / əvəz et).

## Necə sürətli işləyir

- Dəyişiklik ekranda **dərhal** görünür, bazaya arxa planda yazılır (yan paneldə "Saxlanır… / Sinxron").
- Hər 10 saniyədə yalnız **bir kiçik sorğu** gedir: "son dəyişiklikdən sonra nə dəyişib?". Dəyişiklik yoxdursa, heç nə yüklənmir. Varsa, yalnız dəyişən tapşırıqlar gəlir.
- Brauzer son nüsxəni yadda saxlayır: səhifə dərhal açılır, sonra yalnız fərq yüklənir.
- Firestore-un pulsuz limiti (gündə 50 000 oxuma, 20 000 yazma) bu həcm üçün kifayətdir.

---

## Quraşdırma

Firebase layihəsi (`worforce-74ddf`) və Firestore bazası artıq yaradılıb. Firestore qaydalarını dəyişmək, Firebase Authentication-ı açmaq lazım **deyil**: brauzer bazaya birbaşa qoşulmur, bütün sorğular Vercel serverindən service account ilə gedir.

### Vercel mühit dəyişənləri

Vercel → layihə → **Settings → Environment Variables**. Hər birində **Production, Preview, Development** seçili olsun.

| Ad | Dəyər |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase-dən yüklənən service account JSON faylının **bütün məzmunu** (`{` ilə başlayıb `}` ilə bitən) |
| `AUTH_USERS` | İstifadəçilər: `ad:parol`, vergüllə ayrılır. Məs.: `nizami:Güclü-Parol-1,aysel:Başqa-Parol-2` |
| `AUTH_SECRET` | Ən azı 32 simvolluq təsadüfi söz (sessiyanı imzalamaq üçün) |
| `FIRESTORE_DATABASE` | *İstəyə bağlı.* Firestore bazasının ID-si `(default)` deyilsə |

Sonra **Deployments → son deploy → ⋯ → Redeploy**. Sayta daxil olun → "Baza boşdur" bannerində **İlkin məlumatları yüklə**.

> Service account JSON faylı layihəyə tam giriş verir: onu GitHub-a yükləməyin, mesajla göndərməyin. Fayl başqasına düşübsə, Firebase → Project settings → Service accounts → Google Cloud-da həmin açarı silib yenisini yaradın və Vercel-də dəyişəni yeniləyin.

### İstifadəçi əlavə etmək / parolu dəyişmək

`AUTH_USERS`-i dəyişin → **Redeploy**. Siyahıdan çıxarılan istifadəçinin sessiyası dərhal etibarsız olur.

---

## Fayllar

```
public/            Səhifələr (index.html, login.html, app.js, styles.css)
api/               Server funksiyaları: login, logout, data, ops, seed, log
lib/auth.js        Giriş və sessiya (HMAC imzalı cookie, 12 saat)
lib/firestore.js   Firestore REST API (service account), dəyişiklik izləmə
middleware.js      Giriş etməmiş istifadəçini login səhifəsinə yönləndirir
data/seed.json     İlkin məlumatlar (Birbank 266 + Pashapay 75) — ictimai deyil
```

## Hesablama qaydaları

- **Cari icraçı** = yeni icraçı, boşdursa ilkin icraçı.
- **Status**: Ləğv · Transfer (ilkin və yeni icraçı fərqlidir) · Yeni (ilkin icraçı yoxdur) · Mövcud.
- **Yük** = aktiv tapşırıqların illik saatı ÷ (norma × ştat). Ləğv edilmiş işlər daxil deyil.
- **Lazım olan ştat** = aktiv illik saat ÷ norma. **Mövcud ştat** = tapşırığı olan fərdi əməkdaşların ştatlarının cəmi.
- **Fəaliyyət forması** əməkdaşın profilindən gəlir. Başlanğıcda Ağaəli, Aygül, İqrar, Aysel → *Project and AdHoc based*, qalanlar → *Administrativ*.
- "Şöbə əməkdaşları" **qrup**dur: saatları cəmə daxildir, fərdi yükə və mövcud ştata düşmür.
