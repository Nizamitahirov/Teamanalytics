# ADR-010 — v2 canlıda əsas sayt; v1 `/legacy/` altında (keçid)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (sahibin tələbi: "ayrıca versiya yox, birbaşa əsas sayta") · **Əlaqəli:** SPEC §15, §16 (Mərhələ 10)

## Nə dəyişdi
- `vercel.json`: `buildCommand = npm run build:vercel` → `vite build` (v2 → `dist/`) + v1 `public/` olduğu kimi `dist/legacy/`-ə kopyalanır; `outputDirectory = dist`.
- **Marşrutlar:** fayl varsa fayl; `/api/*` — funksiyalar; qalan hər yol → `/index.html` (SPA). Köhnə əlfəcinlər: `/login.html` → `/login`, `/index.html` → `/`, `/legacy` → `/legacy/`.
- **v1 (ehtiyat)** `https://teamanalytics.vercel.app/legacy/` — eyni baza, eyni sessiya cookie-si; yönləndirmələri nisbi edildi (`login.html`, `./`) ki, `/legacy/` daxilində qalsın. SPEC §15.5: ~7 gün sonra silinə bilər (sahibin qərarı ilə).
- Keş: `/assets/*` (hash-li) — 1 il immutable; `/` — no-cache (yeni deploy dərhal görünür).

## Nəzərə alınmalı
- v2 ilkin/admin tərəfindən sıfırlanmış parolla girişdə **parol dəyişməsini məcbur edir** (ADR-005) — `Ecosystem/Ecosystem` ilə girən ilk dəfə yeni parol təyin edir; yeni parol v1-də də (`/legacy/`) işləyir. Server keçid dövründə məcbur etmir (v1 hələ var).
- Bu, SPEC Mərhələ 10-un "keçid" hissəsidir; miqrasiya skripti (`schema_version 2`) tələb olunmur — v2 sahələri isteğe bağlıdır, `normalizeTask` default-ları verir. HTTP başlığı kimi ciddi CSP — v1 `/legacy/` silinəndən sonra (inline skript).
- Geri qayıtmaq: `vercel.json`-da `outputDirectory: "public"` və köhnə `buildCommand` — və ya Vercel-də əvvəlki deploy-u "Promote".

## Yoxlama
Lokal Vercel təqlidi (dist/ + eyni qaydalar): köhnə `/login.html` → `/login`, giriş → məcburi parol → Panel (16,6 FTE), `/scenarios` birbaşa link + yeniləmə, `/legacy/` v1 (effektiv norma 1682), v1 çıxışı `/legacy/login.html`-ə. CI, Playwright 30, v1 e2e keçir.
