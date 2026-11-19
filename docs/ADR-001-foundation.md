# ADR-001 — v2 təməli (Mərhələ 1)

**Tarix:** 2026-11-19 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §4, §13, §15, §16

## Kontekst
SPEC Mərhələ 1: Vite + React + TS skeleti, tokenlər, shell, login, serverin TS-ə köçürülməsi, `updateMask` düzəlişi, Zod sxemləri, mock server TS, CI, qızıl testlər. Şərt: canlı sayt v1 ilə işləməyə davam etməlidir.

## Qərarlar
1. **`updateMask` ilk iş kimi** (SPEC §15.3). `upsert` artıq yalnız göndərilən sahələri (+ `_deleted`, `_ts`) yazır. v1 klienti həmişə bütün öz sahələrini göndərdiyi üçün davranışı dəyişmir; Firestore-dakı əlavə sahələr (v2, konsol) artıq silinmir. `putUser` də maskalıdır (gələcək `role` sahəsi parol dəyişəndə itməsin).
2. **Server TS, Vercel özü kompilyasiya edir.** `api/*.ts` ince adapterlərdir, məntiq `server/`-dədir. ESM importları `.js` uzantısı ilə (NodeNext). Build addımı əlavə edilmədi — sahibə addım yoxdur.
3. **Vercel v1-i yayımlamağa davam edir.** `vercel.json`: `framework: null`, `outputDirectory: public`, heç nə qurmayan `buildCommand`. Vite build-i (`dist/`) yalnız CI-da yoxlanır. Vite `publicDir` = `static/` (v1 `public/` qarışmasın).
4. **Zod yoxlaması v1-ə uyğun və ciddi.** `OpSchema` v1-in göndərdiyi bütün formaları qəbul edir (testlə: `tests/unit/firestore.test.ts`), amma naməlum cədvəl, `_` ilə başlayan sistem sahəsi, `/` olan açar, > 2000 simvol mətn, obyekt dəyər → 400, heç nə yazılmır. Sətir dəyəri skalyardır (Excel importu sətir/rəqəm qarışığı gətirə bilər).
5. **Xəta formatı `{error, code}`** (SPEC §4.4). `error` mətnləri v1 ilə eynidir — v1 klienti `error`-u göstərir.
6. **`GET /api/me`** əlavə edildi: rol sahəsi hələ yoxdursa `admin` (SPEC §2 miqrasiya qaydası). RBAC tətbiqi — Mərhələ 5.
7. **Versiyalar** (dəqiq pin): React 19.3, React Router 8.5, Vite 8.3, Vitest 5.1, Zod 4.6, Playwright 1.63 (sandbox brauzeri ilə eyni).
   - **TypeScript 6.0.3**, 7.x yox: `typescript-eslint` 8.73 `<6.1` tələb edir.
   - **ESLint 9.39**, 10.x yox: `eslint-plugin-jsx-a11y` 6.10 ESLint 10-u dəstəkləmir.
   - Hər ikisi dəstək gələndə yenilənməlidir.
8. **Şrift:** `@fontsource-variable/inter`, yalnız latin + latin-ext (`src/styles/fonts.css`). İkonlar: Lucide.
9. **Qızıl testlər** `tests/golden/v1-metrics.ts`-ə (v1 formulalarının birbaşa köçürməsi) qarşı işləyir; Mərhələ 2-də `shared/metrics.ts`-ə qarşı da işləyəcək.
10. **e2e:** v2 — `@playwright/test` (`dev/e2e/`), v1 — mövcud `dev/e2e.py` (indi xəta olduqda uğursuz olur). CI hər ikisini işlədir.

## Nəticələr
- Firestore oxuma/yazma təsiri: yoxdur (`/api/me` — 2 oxuma, yalnız v2 klienti çağırır).
- Canlıya təsir: yalnız server kodu (eyni davranış + `updateMask` + Zod). Vercel preview deploy-unda `/api/health` → `version: 2.0.0-alpha.1` yoxlanmalıdır.
- Açıq risk: Vercel-in TS funksiya kompilyasiyası sandbox-da yoxlanıla bilmir — preview deploy ilə təsdiqlənməlidir.
