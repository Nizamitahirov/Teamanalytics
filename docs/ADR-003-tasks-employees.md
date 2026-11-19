# ADR-003 — Tapşırıqlar və Əməkdaşlar (Mərhələ 3)

**Tarix:** 2026-11-19 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §5, §6.3, §6.4, §6.9, §16

## Nə quruldu
- **Tapşırıqlar** (`/tasks`): TanStack Table (sıralama, seçim, sütun görünüşü — `localStorage`) + TanStack Virtual; yapışqan başlıq, seçim və əməliyyat sütunları; filtrlər və sıralama **URL-də** (paylaşıla bilən link, `?task=ID` paneli açır); sürətli çiplər (Transferlər, Ləğv olunanlar, Normanı aşanların işləri, Saat uyğunsuzluğu); toplu ötür / ləğv / bərpa / sil; sətirdə redaktə (saat — Enter/Esc; icraçı — combobox); ≤ 700 px kart görünüşü.
- **Tapşırıq paneli** (drawer): bütün sahələr, dəqiqə × təkrar → saat avtomatik (v1 kimi), > 5% saat uyğunsuzluğu xəbərdarlığı + "hesablanmışla əvəz et", tarixçə (jurnaldan), ötür / ləğv / bərpa / sil.
- **Ötürmə dialoqu:** qəbul edənlər yük faizi ilə (ən az yüklü yuxarıda), seçiləndə hər iki tərəf üçün "əvvəl → sonra" yük; normanı aşacaqsa xəbərdarlıq. Tövsiyə (§8) — Mərhələ 6.
- **Əməkdaşlar** (`/employees`): kartlar / cədvəl, filtrlər (şirkət, fəaliyyət forması, yük səviyyəsi, axtarış). **Profil** (`/employees/:name`): tutum (norma × ştat), yük zolağı, proseslər üzrə 100% zolaq, cari / verilmiş işlər, tarixçə, "Hamısını ötür", redaktə, **birləşdirmə önizləməsi** (neçə iş, saat).
- **Jurnal** (`/log`): lokal jurnal (son 2000), filtrlər, günlərə görə qruplaşdırma, tapşırığa keçid. Server səhifələməsi — sonra.
- **Komanda paleti** (Ctrl/⌘+K, `/`): tapşırıq/əməkdaş axtarışı (ə/e, ı/i, ö/o, ü/u, ş/s, ç/c, ğ/g bərabər — `shared/search.ts`) + əməliyyatlar. **Qısayollar:** `g p/e/t/l/s`, `n`, `?`, Ctrl+Z / Ctrl+Shift+Z.
- **Toast** "Geri al" düyməsi ilə; domen əməliyyatları `src/store/actions.ts`-də (v1 `transferTasks`, `setCancelled`, `saveTaskFromModal`, `openEmployeeModal` məntiqinin köçürməsi).

## Qərarlar
1. **TanStack Table 8.21.3, 9.x yox.** v9 (ən son) tamamilə yeni API-dir (features/atoms); v8 sabit, geniş istifadə olunur və ehtiyacımızı tam ödəyir. v9-a keçid ayrıca iş kimi.
2. **Filtrləmə cədvəldən kənarda** (`shared/taskFilter.ts`, saf funksiya, testli) — TanStack yalnız sıralama/seçim/görünüş üçün.
3. **Səhifələr lazy yüklənir** (`react-router` `lazy`): ilkin JS 134 KB gzip (limit 180).
4. **Əməkdaş drawer-i yoxdur** — kart birbaşa profil səhifəsini açır (sürətli baxış üçün ayrıca drawer lazım olmadı).
5. **İdempotent yazma (bug düzəlişi):** cavab gəldikdən sonra, keş yenilənmədən səhifə bağlanarsa eyni partiya təkrar göndərilirdi və server bunu ziddiyyət sayırdı (e2e-də tapıldı). Həll: (a) sənəd artıq istənilən vəziyyətdədirsə server yazmadan keçir, ziddiyyət qaytarmır; (b) göndərilmiş partiya keşdən dərhal silinir. Test: `tests/server/sync.test.ts` (düzəlişsiz yıxılır).
6. **Mətn şəkilçiləri:** adlardan sonra şəkilçi qoyulmur ("Zümrüd-a" səhvdir) — "3 tapşırıq ötürüldü → Zümrüd".

## Hələ edilməyənlər (SPEC §6.3–6.4-dən)
Prioritet, etiketlər, avtomatlaşdırma sütunları (data modeli Mərhələ 7), qruplaşdırma, adlı görünüşlər, sütun enini dəyişmə, şərhlər (Comments), absences, ayrılma axını, əvəzedicilik, "Ssenariyə əlavə et" (Mərhələ 6), sil yalnız admin (Mərhələ 5).

## Testlər
- Vitest 124 (domen əməliyyatları real API ilə, filtrlər, axtarış, idempotentlik).
- Playwright 13: cədvəl/çiplər/URL/yapışqan sütun, profildən ötürmə + toast-dan geri al, ləğv/bərpa, toplu ötürmə, panel düzəlişi, saat uyğunsuzluğu, `n` ilə yeni tapşırıq, sətirdə saat redaktəsi, birləşdirmə, komanda paleti, jurnal, **brauzerdə iki istifadəçi ziddiyyəti**, 820/390 px; konsolda xəta olarsa test yıxılır.
