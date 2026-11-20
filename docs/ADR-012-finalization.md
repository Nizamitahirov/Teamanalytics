# ADR-012 — Mərhələ 10: keçidin tamamlanması

**Tarix:** 2026-11-20 · **Status:** qəbul edilib · **Əlaqəli:** SPEC §11, §15, §16, ADR-010

## Edilənlər
- **Keçid** (ADR-010): v2 canlıda kökdə, v1 `/legacy/` altında ehtiyat. PR #11 (Mərhələ 6-nın paralel, birləşdirilə bilməyən versiyası) bağlandı.
- **CSP HTTP başlığı** (`vercel.json`, yalnız v2 yolları — `/legacy/` və `/api/` xaric): build-dəki meta CSP ilə eyni + `frame-ancestors 'none'`. Sinxronluq testi: `tests/unit/csp.test.ts`.
- **README** — sahib üçün: bölmələr, rollar, hesablama qaydaları (effektiv norma), backup/bərpa, "Problem olduqda" (health, `/legacy/`, Vercel "Promote"), `CRON_SECRET` addım-addım.
- **Miqrasiya skripti lazım olmadı:** v2 sahələri isteğe bağlıdır, default-lar `normalizeTask`/`normalizeEmployee`/`roleOf`-dadır (rol yoxdursa admin); v1 yazmaları `updateMask` ilə v2 sahələrini silmir (test).

## Lighthouse (production build, Vercel qaydaları + gzip, lokal təqlid)
SPEC §11 hədəfi "orta noutbuk, 4G" → Lighthouse **desktop** profili:

| Səhifə | Performance | Accessibility | Best practices | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| Giriş | 100 | 100 | 96* | 0,3 s | 0 ms | 0 |
| Panel | 95 | 100 | 100 | 0,9 s | 170 ms | 0 |
| Tapşırıqlar | 100 | 100 | 100 | 0,8 s | 0 ms | 0 |
| Rəhbərlik hesabatı | 98 | 100 | 100 | 1,1 s | 70 ms | 0 |

\* Girişdə sessiya yoxlaması (`/api/me` → 401) konsolda "xəta" kimi sayılır — gözlənilən davranışdır; `/legacy/` də bu cavaba güvəndiyi üçün dəyişdirilmədi.

Mobil profildə (4× CPU yavaşlatma) Panel ~64: əsas xərc React runtime-ın (react-dom) icrasıdır, tətbiq kodu kiçikdir. İlkin JS 160 KB gzip (limit 180). Gələcək üçün: Panel qrafiklərini görünəndə render etmək (IntersectionObserver).

## Qalan (vaxta bağlı)
- **2026-11-27-dən sonra** (SPEC §15.5, 7 gün): `/legacy/` silinir (`public/` → `legacy`-siz build), server tərəfində məcburi parol dəyişməsi açılır (ADR-005 §1), köhnə `wfp_session` cookie-si qəbul edilmir, v1-ə xas e2e (`dev/e2e.py`) çıxarılır. Sahibin təsdiqi ilə.
- Canlıda "qızıl rəqəmlər eyni" yoxlaması — sandbox canlı sayta çıxa bilmir; sahib `/api/health` və Paneli yoxlayır (canlı data seed-dən fərqli ola bilər).
