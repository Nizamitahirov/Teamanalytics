# ADR-004 — Panel və qrafiklər (Mərhələ 4)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §6.2, §11, §12.1–12.2, §13

## Nə quruldu
- **Qlobal filtrlər** (şirkət, fəaliyyət forması) və **görünüş** (Cari / Optimizasiyadan sonra) URL-də; bütün vidjetlər tabedir.
- Vidjetlər (§6.2): hero + KPI (norması aşan → filtrlənmiş əməkdaşlar), **tutum balansı** (bullet), **yük** (sıralı bar, 85–100% zona, 100% xətti, status rəngi + naxış, qrupları göstər), **şirkət × fəaliyyət forması** matrisi, **Sankey** (ilkin → cari sahib, axın rəngi qəbul edənin statusu), **treemap / sunburst** (drill-down, şirkət rəngi), **waterfall**, **heatmap** (15 proses + "Qalan proseslər", tək icraçı "1"), **Pareto** (ayrıca kumulyativ zolaq, ikinci ox yoxdur), **histogram** (median, norma), **trend** (boş vəziyyət — snapshot Mərhələ 9), **ştat cədvəli** (tək icraçı, son 30 gündə alınan/verilən saat, CSV).
- Hər qrafik `ChartFrame`-də: ⓘ (formula), **"Cədvəl kimi bax"** (eyni rəqəmlər), SVG/PNG yüklə, tam ekran, ekran oxuyucu üçün avtomatik xülasə (`aria-describedby` + ECharts `aria`). Klik naviqasiyası: bar → profil, axın → transfer işləri, xana → filtrlənmiş tapşırıqlar, treemap yarpağı → tapşırıq paneli.
- Data: `shared/dashboard.ts` (saf, testli). Option-lar: `src/charts/options/*.ts` (saf funksiya: data + tema → ECharts option + cədvəl + xülasə).

## Qərarlar
1. **ECharts 6.1** (SPEC-də 5 yazılıb; 6 ən son stabil, API uyğundur). Modul importu (`echarts/core`), **SVG renderer** — kəskin, çapda vektor (Mərhələ 8 PDF), SVG export birbaşa; PNG SVG-dən 2× çəkilir.
2. **Temalar ayrıca:** `src/charts/theme.ts` — açıq və tünd palitralar SPEC §12.1-dən, dataviz validatorundan keçib (light #fcfcfb, dark #12141F: ALL PASS; ən pis CVD ΔE 12,6 / 12,7). Mövzu dəyişəndə qrafiklər dərhal yenidən çəkilir.
3. **Status MƏTN tokenləri** (`--good-text`, `--warning-text`, `--critical-text`): axe yaşıl/sarı mətnin kontrastını < 4,5:1 tapdı; qrafik doldurma rəngləri dəyişmədi, yalnız mətn tündləşdi.
4. **Waterfall oxu sıfırdan** (kəsik ox fərqi şişirdir). **Histogram/Pareto** etiketləri başlığa keçirildi (üst-üstə düşməsin).
5. **"Qalan proseslər"**: heatmap-də "Digər" adlı real proses olduğu üçün qruplaşdırılmış sütunun adı fərqlidir (əvvəl iki eyni adlı sütun yaranırdı).
6. **Hərəkət azaldılması:** `prefers-reduced-motion` → qrafik animasiyası yoxdur; e2e bu rejimdə işləyir (ekran şəkilləri animasiya ortasında çəkilmir).
7. **Bundle:** Panel səhifəsi (hero/KPI) 2,6 KB, qrafiklər (ECharts) ayrıca lazy chunk 239 KB gzip; ilkin JS ~136 KB (limit 180).
8. **Realizə olunmuş optimizasiya** (waterfall pilləsi) hələ 0 — avtomatlaşdırma portfeli Mərhələ 7-də.

## Hələ edilməyənlər (§6.2)
Sparkline və 30 günlük dəyişmə (snapshot — Mərhələ 9), ssenari görünüşü (Mərhələ 6), optimizasiya portfeli KPI-ı (Mərhələ 7), vidjetləri gizlətmə/sıralama, Lighthouse CI.

## Testlər
- Vitest 149: panel datası qızıl rəqəmlərlə (waterfall 28 782 → 27 795, Sankey cəmi = transfer, treemap = 27 849,56, heatmap, Pareto 80%, histogram 18 nəfər), option-lar (aria, cədvəl, bir grid — bir y oxu, determinizm, tünd ≠ açıq, şirkət rəngi varlığa bağlı).
- Playwright 18: bütün vidjetlər, cədvəl görünüşü rəqəmləri, filtrlər URL-də, KPI klik, tünd rejim, 1440/820/390, **axe** (Panel, Tapşırıqlar, Əməkdaşlar, Profil, Jurnal — 0 ciddi/kritik), **vizual reqressiya** (5 vidjet × açıq/tünd, fərq ≥ 0,1% → yıxılır; etalonlar `dev/e2e/dashboard.spec.ts-snapshots/`).
- Mock serverə `POST :8791/reset` əlavə olundu (e2e təmiz baza ilə).
