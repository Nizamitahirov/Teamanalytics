# ADR-005 — Rollar və təhlükəsizlik (Mərhələ 5)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §2, §6.1, §6.10, §10

## Nə quruldu
- **RBAC serverdə** (`server/http.ts → requireUser(req, res, minRole)`): `viewer` — yalnız oxuma; `editor` — `POST /api/ops`; `admin` — `/api/users` və ayarlar. Rol yoxdursa `admin` (SPEC §2 miqrasiya qaydası — mövcud istifadəçilər admin qalır). Rol hər sorğuda bazadan (60 s keş) götürülür.
- **Sessiya** (`server/auth.ts`): cookie `__Host-wfp_session` (Secure, HttpOnly, SameSite=Lax, Path=/), payload `{u, id, role, sv, exp}`. `sv` ≠ `users.session_version` → 401. Parol dəyişəndə / admin sıfırlayanda / "sessiyaları ləğv et" → `session_version + 1`; istifadəçi silinəndə dərhal 401. **Köhnə `wfp_session` cookie-si qəbul olunur** (canlıdakı açıq sessiyalar kəsilmir) və növbəti girişdə silinir. "Məni xatırla" → 7 gün, əks halda 12 saat.
- **Kilid Firestore-da**: 5 yanlış cəhd → `locked_until` = 15 dəq (instansiyadan asılı deyil); cavab 423 + vaxt. Yanlış ad və yanlış parol eyni cavabı verir. Admin kilidi aça bilir. IP üzrə yaddaş limiti (20/10 dəq) əlavə qat kimi qalır.
- **Parol siyasəti**: ≥ 10 simvol, ən çox yayılmış 1000 parol (`server/commonPasswords.ts`, mənbə: `@zxcvbn-ts/language-common` MIT, tezliyə görə ilk 1000), təkrar simvol, "ecosystem/birbank/…" + qısa əlavə, adı ehtiva edən parol rədd edilir.
- **Məcburi parol dəyişməsi**: ilkin `Ecosystem/Ecosystem` heşi ilə giriş və ya admin sıfırlaması/yeni istifadəçi → `mustChange`. v2 klienti tətbiqə buraxmır (parol dəyişmə ekranı).
- **CSRF**: `POST`-larda `Sec-Fetch-Site` (same-origin/none) və `Origin` = host (`x-forwarded-host` nəzərə alınır). Başlıqsız (brauzer olmayan) klientlər buraxılır — onlar cookie-ni avtomatik göndərmir.
- **Sorğu limiti**: istifadəçi başına 300/dəq (instansiya yaddaşı) → 429.
- **Audit**: hər `POST`-un jurnal qeydlərinə `ip_hash` (SHA-256, sirrlə duzlanmış, 16 hex) — IP-nin özü saxlanmır.
- **Başlıqlar**: Vercel-ə HSTS və Permissions-Policy əlavə olundu. **Ciddi CSP** v2 build-inə meta teq kimi (`vite.config.ts`).
- **Klient**: "Məni xatırla", kilid mesajı (vaxtla), məcburi parol ekranı, viewer üçün yalnız baxış (redaktə elementləri gizli + store yazmaları bloklayır), **Ayarlar** (Hesabım — parol dəyiş; Ümumi — norma/hədd, admin; İstifadəçilər — əlavə et (müvəqqəti parol generatoru), rol, parol sıfırla, sessiyaları ləğv et, kilidi aç, sil; Qısayollar).

## Qərarlar / kompromislər
1. **Keçid dövrü (canlı hələ v1):** server məcburi parol dəyişməsini **tətbiq etmir** — v1 klientində parol dəyişmə ekranı yoxdur, 403 qaytarsaq v1 işləməz. Məcburiyyət v2 klientindədir; server tərəfli məcburiyyət Mərhələ 10-da (keçid) açılacaq. Sahib canlı saytda Ayarlar → İstifadəçilər-dən parolu indi də dəyişə bilər.
2. **CSP HTTP başlığı kimi yox:** v1 `login.html` inline skript işlədir — ciddi CSP canlı girişi sındırardı. v2 build-ində meta CSP var; HTTP başlığı Mərhələ 10-da.
3. **v1 klientinin parol siyasəti:** v1 UI "≥ 6 simvol" yazır, server isə artıq ≥ 10 tələb edir — server xəta mətnini qaytarır, v1 onu göstərir.
4. **Rol dəyişikliyi sessiyanı bağlamır** — rol hər sorğuda bazadan oxunur (≤ 60 s).
5. **Yeni istifadəçinin default rolu `editor`**, admin istəsə dəyişir.

## Tapılan və düzəldilən buglar
- **Seed baş vermirdi:** təmiz bazada ilk addım parol dəyişməsi olanda jurnal yazısı `meta.updated` qoyurdu, seed şərti isə `!ts` idi → ilkin data heç vaxt yazılmırdı. İndi şərt "tapşırıq və əməkdaş yoxdur" (`seed()` özü tombstone-ları yoxlayır). Test: `tests/server/seed.test.ts` (düzəlişsiz yıxılır).
- **Dev proksi CSRF:** Vite proksisi `Host`-u dəyişirdi → öz saytın girişi rədd edilirdi. `xfwd: true`.

## Testlər
- Vitest 188: **RBAC matrisi** (7 endpoint × 3 rol), kilid, sessiya versiyası (parol dəyişmə, sıfırlama, ləğv, silmə), rol dəyişikliyi, sonuncu admin, parol siyasəti, CSRF, ip_hash, limit, "Məni xatırla", köhnə cookie, seed.
- Playwright 23: məcburi parol ekranı, viewer (UI + server 403), editor, admin istifadəçi idarəsi + axe, kilid mesajı, 7 günlük cookie; v2 build + CSP brauzerdə yoxlanıb.

## Firestore büdcəsi
- İstifadəçi sənədi: sessiya yoxlaması 60 s keşlə (10 s-lik yoxlama ilə ~1 oxuma/dəq/istifadəçi/instansiya).
- Giriş: +1 yazma (sayğac/last_login).
