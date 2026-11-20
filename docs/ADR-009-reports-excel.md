# ADR-009 — Hesabatlar və Excel v2 (Mərhələ 8)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib · **Əlaqəli:** SPEC §6.7, §9

## Nə quruldu
- **`/reports`** — hesabatlar mərkəzi: Rəhbərlik hesabatı (şirkət/fəaliyyət filtri, "Aç" və "PDF (çap)"), Əməkdaş kartı, Proses hesabatı, Jurnal hesabatı, Excel/CSV export (+ istəyə görə Ssenari vərəqi), import şablonu, Excel import. "Dövr müqayisəsi" — Mərhələ 9 (gündəlik snapshot lazımdır).
- **Rəhbərlik hesabatı** (`/reports/executive`): A4 üfüqi, **4 səhifə** (PDF testi 2–4 yoxlayır): 1) titul, 4 KPI, effektiv norma izahı (ADR-008), 3 cümləlik avtomatik şərh (`shared/report.ts`, şablon — LLM yox), risklər (normanı aşanlar, tək icraçılı proseslər, data sağlamlığı); 2) yük + waterfall; 3) Sankey + Pareto; 4) ştat cədvəli. Qrafiklər SVG (vektor, mətn seçilə bilir), çap rəngləri sabit açıq tema. `?print=1` → avtomatik `window.print()`.
- **Çap qatı** (`src/styles/print.css`): `@page A4 landscape`, qabıq (`data-print-hide`) gizlənir, `print-color-adjust: exact`, `break-inside: avoid`, səhifə fasilələri (`data-print-page`).
- **Excel export** (`shared/excel.ts → exportSheets`, `src/lib/excel.ts`): Hesabat (KPI-lar, norma/məzuniyyət/effektiv norma, tarix, filtrlər, hazırlayan), Tapşırıqlar (v1 başlıqları + optimizasiya statusu, hədəf rüb), Əməkdaşlar, Yük analizi (effektiv norma), Jurnal (tam — `/api/log`), Ssenari (seçilibsə: Cari vs Ssenari + dəyişikliklər). Sütun enləri, rəqəm formatı, avtofiltr, dondurulmuş başlıq. CSV (UTF-8 BOM, `;`).
- **Import sehrbazı** (`/reports/import`, editor+): 1) fayl + vərəq; 2) sütun xəritəsi — avtomatik (v1 alias-ları + CONTEXT.md §2 başlıqları), əl ilə düzəliş, eyni başlıqlı fayl üçün yadda saxlanılır (localStorage); 3) validasiya + diff önizləmə (yeni / dəyişəcək — sahə-sahə köhnə→yeni / dəyişməyən / xətalı — sətir nömrəsi ilə; xəta varsa "yalnız xətasızları yüklə" tələb olunur); 4) rejim: **yenilə + əlavə et** (default), **ssenari kimi** (canlı data dəyişmir — `import` növlü ssenari dəyişikliyi), **əvəz et** (yalnız admin; faylda olmayanlar yumşaq silinir; əvvəl avtomatik Excel backup yüklənir).

## Qərarlar
1. **SheetJS CDN-dən (0.20.3), lazy** — v1 ilə eyni, bundle-a düşmür; npm-dəki 0.18.5 məlum zəifliklərə malikdir. CSP-də yalnız `cdn.sheetjs.com`. Testlər: CDN əlçatmazdırsa `XLSX_PATH` ilə lokal fayl (Playwright `route`).
2. **Boş xana = "dəyişmə"** (mövcud tapşırıqda) — import heç vaxt dəyəri təsadüfən silmir ("heç nə itmir", SPEC §1.3). Boş "Ləğv edilib" ləğvi geri qaytarmır.
3. **Qismən yeniləmə faylı** (yalnız `id` + bir sütun) icazəlidir; tapşırıq/proses və saat yalnız **yeni** sətir üçün məcburidir.
4. **Başlıq tanınması**: "İ" → "i" əvvəlcə (v1 bug-ı), "ı" → "i" hər iki tərəfdə (BÖYÜK HƏRFLİ başlıqlar da tanınır).
5. **Yazma diff ilə** (`importPlan` → yeni vəziyyət → `commit` → `diffOps`) — kolleksiya əvəz olunmur (CLAUDE.md §6); undo bir addımdır, jurnala bir "Import" qeydi.
6. **SheetJS CE** başlıq üslubunu (qalın) yazmır — ayrıca kitabxana əlavə edilmədi.

## Testlər
Vitest 246 (sütun xəritəsi + İ/i reqressiyası, validasiya, diff, əvəz et, export vərəqləri, CSV, şərh, hesabat datası). Playwright 30: rəhbərlik hesabatı (şərh, effektiv norma, PDF 4 səhifə, qabıq çapda gizli, axe), əməkdaş/proses/jurnal, Excel export → eyni faylın importu 0 dəyişiklik (roundtrip) → dəyişdirilmiş fayl: 1 yeni, 1 dəyişən, 1 xətalı → yükləmə və baza yoxlaması.
