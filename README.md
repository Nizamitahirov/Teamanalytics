# Workforce Planning — Əmək Münasibətləri

Şöbənin proseslərini, tapşırıqlarını və iş yükünü idarə etmək üçün veb platforma.

## Nə edir

| Bölmə | İmkanlar |
|---|---|
| **Panel** | İllik iş həcmi, lazım olan və mövcud ştat (FTE), normanı aşan əməkdaşlar, ləğvdən qənaət, optimizasiya potensialı. Əməkdaşların yüklənmə qrafiki (norma 1922 saat), yerdəyişmədən əvvəl/indi müqayisəsi, şirkət / fəaliyyət forması / status üzrə bölgü, proses və kateqoriya üzrə saatlar, ştat cədvəli. Şirkət və fəaliyyət forması üzrə filtr, "Optimizasiyadan sonra" ssenarisi. |
| **Əməkdaşlar** | Hər əməkdaşın kartı: tapşırıq sayı, illik saat, yük faizi. Karta klikləyəndə tapşırıqların siyahısı açılır: ötürmək, ləğv etmək, bərpa etmək, redaktə etmək, "Hamısını ötür" (əməkdaş gedəndə). Profil: şirkət, fəaliyyət forması, ştat (0.5 və s.), qrup. Adı mövcud başqa adla əvəz etsəniz, iki profil birləşir (məs. "Kamilə" → "Kamila"). |
| **Tapşırıqlar** | Bütün tapşırıqlar: axtarış, filtrlər, sıralama. Çoxlu seçim ilə toplu ötürmə, ləğv, bərpa, silmə. Ötürmə pəncərəsi qəbul edən əməkdaşın yükünün necə dəyişəcəyini göstərir. |
| **Jurnal** | Hər ötürmə, ləğv, bərpa, düzəliş və import: tarix, kimdən → kimə, şərh. |
| **Ayarlar** | İllik norma, yüksək yük həddi, Google Sheet bağlantısı, boş Excel şablonu, ilkin məlumatlara qaytarma. |

Əlavə: **Geri al** düyməsi (və ya Ctrl+Z) son 30 əməliyyatı geri qaytarır. **Excel** düyməsi 4 vərəqli fayl yaradır (Tapşırıqlar, Əməkdaşlar, Yük analizi, Jurnal). **Import** həmin formatı və ya ilkin cədvəllərin sütun adlarını qəbul edir.

### Hesablama qaydaları

- **Cari icraçı** = "Yeni icraçı", boşdursa "İlkin icraçı".
- **Status**: Ləğv (ləğv edilib) · Transfer (ilkin və yeni icraçı fərqlidir) · Yeni (ilkin icraçı yoxdur) · Mövcud.
- **Yük** = cari icraçının aktiv tapşırıqlarının illik saatı ÷ (norma × ştat). Norma: 1922 saat (2026). Ləğv edilmiş işlər daxil deyil.
- **Lazım olan ştat (FTE)** = aktiv illik saat ÷ norma.
- **Fəaliyyət forması** əməkdaşın profilindən götürülür. Başlanğıcda Ağaəli, Aygül, İqrar, Aysel → *Project and AdHoc based*, qalanlar → *Administrativ*.
- "Şöbə əməkdaşları" **qrup** kimi qeyd olunub: saatları cəmə daxildir, amma fərdi yük və mövcud ştat hesabına düşmür.

## Fayllar

```
index.html          Səhifə
app.js              Bütün məntiq
styles.css          Dizayn
seed-data.js        Başlanğıc məlumatlar (Birbank 266 + Pashapay 75 tapşırıq)
apps-script/Code.gs Google Sheet backend
```

## Saytı açmaq (GitHub Pages)

1. Repo → **Settings → Pages**.
2. *Source*: **Deploy from a branch**, Branch: **main**, qovluq: **/ (root)** → Save.
3. 1–2 dəqiqədən sonra sayt `https://nizamitahirov.github.io/Teamanalytics/` ünvanında açılır.

Faylları kompüterdə birbaşa açmaq da olar (`index.html` → brauzer). İnternet lazımdır (qrafik və Excel kitabxanaları CDN-dən yüklənir).

## Məlumatlar harada saxlanır

**Google Sheet qoşulmayıbsa** məlumatlar yalnız həmin brauzerdə (localStorage) saxlanır. Başqa kompüterdə və ya başqa brauzerdə görünməz. Brauzer məlumatlarını təmizləsəniz, dəyişikliklər itir. Excel export ehtiyat nüsxə kimi istifadə oluna bilər.

**Komanda ilə işləmək üçün Google Sheet qoşun** (bir dəfəlik, ~10 dəqiqə):

1. Yeni Google Sheet yaradın (məs. "Workforce Planning DB").
2. **Extensions → Apps Script**. `Code.gs`-dəki hər şeyi silin, bu repo-dakı `apps-script/Code.gs`-in məzmununu yapışdırın, saxlayın.
3. **Project Settings (⚙) → Script properties → Add script property**: Property `TOKEN`, Value: uzun təsadüfi söz (məs. `wfp-7Kq2-xR91-mZ4p`). Bu açarı yalnız platformadan istifadə edənlərə verin.
4. **Deploy → New deployment** → növ: **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → **Deploy**. Google icazə istəyəcək: hesabınızı seçin → *Advanced* → *Go to … (unsafe)* → *Allow*.
5. Verilən **Web app URL**-ni kopyalayın (`https://script.google.com/macros/s/.../exec`).
6. Platformada **Ayarlar → Google Sheet bağlantısı**: URL və TOKEN-i yazın → **Qoş və yüklə**.
7. Sheet boşdursa, **Bu məlumatları Sheet-ə yaz** düyməsini basın. Indiki məlumatlar Sheet-ə köçürülür.
8. Komanda üzvləri də 6-cı addımı edir. Bundan sonra hər dəyişiklik avtomatik Sheet-ə yazılır.

Qeydlər:
- İki nəfər eyni anda dəyişiklik edərsə, ikinci şəxsə "ziddiyyət" bildirişi göstərilir və son versiya yüklənir. O, əməliyyatını yenidən edir.
- `Code.gs`-i dəyişsəniz, **Deploy → Manage deployments → Edit → New version** edin, yoxsa köhnə versiya işləyir.
- Köhnə `index.html` başqa Apps Script-ə (köhnə Sheet) qoşulmuşdu. Yeni platforma ondan istifadə etmir; o Sheet olduğu kimi qalır.
- Giriş açarı brauzerdə saxlanır. Bu, ciddi qorunma deyil: kim açarı bilirsə, məlumatları oxuya və dəyişə bilər. Həssas məlumat (əmək haqqı və s.) bu platformaya yazılmamalıdır.
