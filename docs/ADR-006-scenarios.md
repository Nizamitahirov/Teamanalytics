# ADR-006 — Ssenarilər, balanslama, təsdiq axını (Mərhələ 6)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §2, §6.5, §8

## Nə quruldu
- **`shared/apply.ts`** (server və klient eyni kod): `applyOpsLocal` (op-ların lokal tətbiqi, `updateMask` semantikası), `compileOps` (dəyişiklikləri sənəd üzrə bir partiyaya yığır: ilk `v`, ilk `base`), `resolveVersions` (server/firestore.ts-dən köçürüldü — server də buradan istifadə edir), `invertOps` (geri alma op-ları), `staleDocs`.
- **`shared/scenario.ts`**: dəyişiklik qurucuları (ötür, ləğv/bərpa, saat, yeni iş, əməkdaş əlavə et/ayrılır, ştat, norma, avtomatlaşdırma −X%, balans) və `scenarioImpact` (Cari vs Ssenari metrikaları `shared/metrics.ts`-dən — tək mənbə).
- **`shared/rebalance.ts`** — §8 deterministik greedy (donorlar azalan yükə görə, işlər artan saata görə, qəbul edən ≤ θ − 0,05, bərabərlikdə prosesi bilən → ad; eyni şirkət default açıq; kilidli işlər; `eligible`/`skills` varsa nəzərə alınır). Seed-də 341 iş ~5 ms.
- **Ssenari = etiket + `Op[]`** (`diffOps` ilə, `v`/`base` daxil). Ssenari datası = canlı data + op-ların tətbiqi; ssenari ilə işləmək canlı kolleksiyalara heç nə yazmır (server testi + e2e yoxlayır).
- **API:** `GET/POST /api/scenarios` (create/update/delete/submit/reject/archive/restore/applied/reverted), `POST /api/notifications` (read/read-all, yalnız öz bildirişi). Ssenari və bildirişlər `/api/data` ilə gəlir (tam yükləmədə və deltada — ayrıca yoxlama sorğusu yoxdur).
- **Klient:** `/scenarios` (şablonlar, status filtri, 2–3 ssenarinin müqayisəsi), `/scenarios/:id` (dəyişikliklər · Cari vs Ssenari KPI + qoşa yük barları · yükü dəyişənlər), tətbiq/geri alma önizləməsi, ziddiyyət seçimi, bildiriş zəngi, Panel/Əməkdaşlarda "Yükü balansla", Ayarlarda təsdiq axını.

## Qərarlar
1. **Tətbiq klientdə, `dataStore.commit` ilə** (server tətbiqi yox): undo (bir addım), jurnal, offline növbə, versiya ziddiyyəti dialoqu adi dəyişikliklərdəki kimi işləyir. Tətbiqdən əvvəl ssenarinin op-ları (`v`/`base` ssenari yazılan andakı) `resolveVersions` ilə canlı dataya qarşı yoxlanır → "ssenari yaradılandan sonra dəyişmiş sənədlər" siyahısı; hər biri üçün "cari qalsın" (default) və ya "ssenarininki yazılsın". Sonra `applied` statusu və geri alma op-ları serverdə saxlanır → başqa sessiyadan da "Geri al" mümkündür (sonradan dəyişmiş sənədlər üçün xəbərdarlıq).
2. **Jurnal qrupu:** `log.group = ssenari id` (yeni sahə); tapşırıq üzrə ötürmə/ləğv qeydləri tapşırıq tarixçəsinə düşür.
3. **Təsdiq axını** `meta/main.approval` (0/1, default 0) və `approval_hours` (default 40). Açıq olanda editor tətbiq edə bilmir (server 403 `approval_required`), "Təsdiqə göndər" → hər aktiv admin-ə bildiriş; admin "Təsdiqlə və tətbiq et" / "Rədd et" (səbəblə) → müəllifə bildiriş. Editor-un ≥ 40 saatlıq ötürməsi avtomatik təsdiq gözləyən ssenari olur. **Kompromis:** `/api/ops` editor-un birbaşa böyük ötürməsini serverdə bloklamır (UX səviyyəsində) — editor onsuz da tapşırıq CRUD hüququna malikdir (SPEC §2).
4. Firestore sahələri skalyar olduğundan `changes`, `summary`, `revert` JSON sətri kimi saxlanır (≤ 800 KB; aşsa 413).
5. Ssenari sənədində son yazan qalib gəlir (redaktə nadir və adətən bir nəfərlikdir).
6. Yeni token `--brand-text` (#b93a0b / tünd #ff8a5b): brend rəngində mətn AA kontrastı üçün (axe tapdı).
7. Keş versiyası 2 (IndexedDB-də ssenari/bildiriş də saxlanır).

## Firestore büdcəsi
- Dəyişiklik olmayan yoxlama: dəyişməz (1 oxuma). Delta: 3 → 5 sorğu (`scenarios`, `notifications` əlavə). Tam yükləmə: + ssenari sayı + ≤ 500 bildiriş (`to == ad` filtri, kompozit indeks lazım deyil).
- Ssenari əməliyyatı: 1 oxuma + 1 meta (təsdiq yoxlaması) + admin siyahısı (göndərəndə); 1 commit.
- Vercel funksiyaları: 10 (Hobby limiti 12; Mərhələ 9 `snapshots` + `cron/daily` ilə 12 olur).

## Testlər
- Vitest 220: `apply` (tətbiq/birləşdirmə/ziddiyyət/geri alma), `rebalance` (deterministik, θ − 0,05, çatışmazlıq, bərabərlik qaydası, şirkət, kilid, ≤ 50 ms), server: RBAC, "ssenari canlı dataya yazmır", tətbiq sonrası rəqəmlər = ssenari rəqəmləri, geri alma, ziddiyyət + "burax", təsdiq axını + bildirişlər; RBAC matrisinə yeni endpoint-lər.
- Playwright 25: balanslama ssenarisi (canlı data dəyişmir → tətbiq → Panel 0 → geri alma → 3), təsdiq axını iki brauzerdə, axe; v1 e2e keçir.

## Qeyd (sahib üçün)
Balanslama boş (0 tapşırıqlı) əməkdaşlara iş verəndə onlar "Mövcud ştat"a daxil olur (§7.5 qaydası: aktiv işi olanlar). Seed-də: 18 → 22. Formula dəyişməyib.
