# Workforce Planning — Əmək Münasibətləri

Şöbənin proseslərini, tapşırıqlarını və iş yükünü idarə etmək üçün veb platforma. Vercel-də işləyir, məlumatlar Google Sheet-də saxlanır, giriş ad və parolla olur.

## İmkanlar

- **Panel**: illik iş həcmi, lazım olan və mövcud ştat (norma 1922 saat), ehtiyat/çatışmazlıq, normanı aşanlar, ləğvdən qənaət, optimizasiya potensialı. Əməkdaşların yük qrafiki, ötürmələrdən əvvəl/indi müqayisəsi, şirkət / fəaliyyət forması / status bölgüsü, proses və kateqoriya üzrə saatlar, ştat cədvəli.
- **Əməkdaşlar**: yük kartları. Tapşırıqları ötürmək (qəbul edənin yükü əvvəlcədən göstərilir), ləğv, bərpa, "Hamısını ötür". Profil: şirkət, fəaliyyət forması, ştat (0.5 və s.), qrup. Adları birləşdirmək (məs. "Kamilə" → "Kamila").
- **Tapşırıqlar**: axtarış, filtrlər, sıralama, toplu ötürmə / ləğv / bərpa / silmə.
- **Jurnal**: hər əməliyyat — kim, nə vaxt, kimdən → kimə, şərh.
- **Geri al** (son 30 əməliyyat, Ctrl+Z), **Excel export** (4 vərəq) və **import** (yenilə / əvəz et).

## Necə sürətli işləyir

- Dəyişiklik ekranda **dərhal** görünür. Sheet-ə arxa planda yazılır. Yan paneldə "Saxlanır… / Sinxron" göstərilir.
- Server Google Sheets API ilə birbaşa işləyir (Apps Script yoxdur). Hər dəyişiklik bir sorğu ilə gedir və yalnız dəyişən sətirlərə yazılır, ona görə başqalarının dəyişiklikləri üzərinə yazılmır.
- Başqalarının dəyişiklikləri hər 20 saniyədə avtomatik gəlir. ⟳ düyməsi dərhal yeniləyir.
- Sheet-də birbaşa düzəliş etmək olar: başlıq sətrinə toxunmayın. Öz əlavə sütunlarınız saxlanılır.

---

## Quraşdırma (bir dəfəlik, ~20 dəqiqə)

### 1. Google Sheet və service account

1. Yeni **boş Google Sheet** yaradın (məs. "Workforce Planning DB"). Ünvandakı ID-ni kopyalayın:
   `https://docs.google.com/spreadsheets/d/`**`BU_HİSSƏ`**`/edit` → bu **SHEET_ID**-dir.
2. [console.cloud.google.com](https://console.cloud.google.com) → yeni layihə yaradın (məs. "workforce-planning").
3. **APIs & Services → Library → "Google Sheets API" → Enable**.
4. **APIs & Services → Credentials → Create credentials → Service account**. Ad verin, rol seçmək lazım deyil → **Done**.
5. Yaranan service account-a klikləyin → **Keys → Add key → Create new key → JSON**. Fayl yüklənəcək. Onu heç kimə göndərməyin və repo-ya qoymayın.
6. JSON faylda iki dəyər lazımdır: `client_email` və `private_key`.
7. Google Sheet-də **Share** düyməsini basın → `client_email`-i yazın → **Editor** → **Send**.

> Şirkətinizin Google Workspace-i xarici service account ilə paylaşmağa icazə vermirsə, bu addımda xəta çıxacaq. Onda IT-dən icazə istəyin və ya Sheet-i şəxsi Google hesabında yaradın.

### 2. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub-dan **Teamanalytics** repo-nu seçin → **Import**.
2. *Framework Preset*: **Other**. Qalan ayarlara toxunmayın.
3. **Environment Variables** bölməsinə bunları əlavə edin:

| Ad | Dəyər |
|---|---|
| `SHEET_ID` | 1-ci addımdakı Sheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON-dakı `client_email` |
| `GOOGLE_PRIVATE_KEY` | JSON-dakı `private_key` — `-----BEGIN PRIVATE KEY-----` ilə başlayan bütün mətn, dırnaqsız |
| `AUTH_USERS` | İstifadəçilər: `ad:parol`, vergüllə ayrılır. Məs.: `nizami:Güclü-Parol-1,aysel:Başqa-Parol-2` |
| `AUTH_SECRET` | Ən azı 32 simvolluq təsadüfi söz (sessiyanı imzalamaq üçün). Parol menecerinin generatoru ilə yaradın |

4. **Deploy**. 1 dəqiqədən sonra sayt `https://<layihə>.vercel.app` ünvanında açılır.
5. Sayta daxil olun → "Google Sheet boşdur" bannerində **İlkin məlumatları yüklə**. 341 tapşırıq və 23 əməkdaş Sheet-ə yazılır. Vərəqlər (Tasks, Employees, Log, Settings) avtomatik yaradılır.

### İstifadəçi əlavə etmək / parolu dəyişmək

Vercel → layihə → **Settings → Environment Variables** → `AUTH_USERS`-i dəyişin → **Deployments → son deploy → Redeploy**. Siyahıdan çıxarılan istifadəçinin sessiyası dərhal etibarsız olur.

---

## Fayllar

```
public/            Səhifələr (index.html, login.html, app.js, styles.css)
api/               Server funksiyaları: login, logout, data, ops, seed
lib/auth.js        Giriş və sessiya (HMAC imzalı cookie, 12 saat)
lib/sheets.js      Google Sheets API (service account)
middleware.js      Giriş etməmiş istifadəçini login səhifəsinə yönləndirir
data/seed.json     İlkin məlumatlar (Birbank 266 + Pashapay 75) — ictimai deyil
```

## Hesablama qaydaları

- **Cari icraçı** = "owner_after", boşdursa "owner_before".
- **Status**: Ləğv · Transfer (ilkin və yeni icraçı fərqlidir) · Yeni (ilkin icraçı yoxdur) · Mövcud.
- **Yük** = aktiv tapşırıqların illik saatı ÷ (norma × ştat). Ləğv edilmiş işlər daxil deyil.
- **Lazım olan ştat** = aktiv illik saat ÷ norma. **Mövcud ştat** = tapşırığı olan fərdi əməkdaşların ştatlarının cəmi.
- **Fəaliyyət forması** əməkdaşın profilindən gəlir. Başlanğıcda Ağaəli, Aygül, İqrar, Aysel → *Project and AdHoc based*, qalanlar → *Administrativ*.
- "Şöbə əməkdaşları" **qrup**dur: saatları cəmə daxildir, fərdi yükə və mövcud ştata düşmür.
