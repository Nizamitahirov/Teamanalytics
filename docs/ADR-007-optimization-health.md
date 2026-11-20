# ADR-007 — Optimizasiya portfeli və Data sağlamlığı (Mərhələ 7)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §4.5, §6.6, §6.8, §7.8

## Nə quruldu
- **Model (SPEC §4.5):** tapşırığa `automation` (none/candidate/in_progress/done/rejected), `automation_note`, `due_quarter`, `opt_before`, `opt_done_at`, `health_ignore`; əməkdaşa `health_ignore`. Hamısı isteğe bağlıdır; v1 tam sətir yazanda `updateMask` sayəsində qorunur (server testi). Miqrasiya qaydası `normalizeTask`-dadır: sahə yoxdursa `after_opt` olan iş → `candidate`.
- **`/optimization`:** KPI-lar (potensial §7.8, realizə olunmuş, icrada, namizədlər), Kanban Namizəd → İcrada → Tamamlandı (+ Rədd edildi) — sürüklə-burax və hər kartda status seçimi (klaviatura), kartı düzəlt (hədəf saat, hədəf rüb, qeyd), portfelə iş əlavə et, "Yaxşı namizəd" nişanı (after_opt + ildə ≥ 500 + ≤ 10 dəq), təkliflər (eyni qayda, hələ hədəf saatı yoxdur), rüblər üzrə plan vs fakt.
- **"Tamamlandı"** edilərkən: "Saatı hədəf dəyərlə əvəz edək?" → `hours = after_opt`, köhnə saat `opt_before`-da və jurnalda. Tamamlandıdan geri çıxanda saat bərpa olunur.
- **`/health`** (`shared/health.ts`, saf funksiya, klientdə hər dəyişiklikdə): ad dublikatı (fold + boşluqsuz, ə→e və ə→a iki açar, Levenshtein ≤ 1), təkrar tapşırıq, saat uyğunsuzluğu (> 5%), ID problemi (+ oxşar iş), sahibsiz iş, aktiv olmayan əməkdaşda iş, tutumsuz əməkdaş. Düzəlişlər: birləşdir (önizləmə, hansı ad qalır), dublikatı sil (yumşaq), hesablanmış saat, ID-ni düzəlt, ötür, ştatı təyin et; "Fərqlidir/Saxla" → `health_ignore`. Düzəlişlər yalnız admin-ə (SPEC §2). Paneldə tapıntı sayı linki.
- **Waterfall:** "Optimizasiya (realizə)" pilləsi artıq hesablanır (əvvəl 0 idi).

## Qərarlar
1. **Realizə olunmuş qənaət tapşırığın özündə (`opt_before`)**, jurnaldan yox: klient jurnalı 2 000 qeydlə məhdudlaşır, köhnə qeydlər itə bilər. Saat əvəz olunmayıbsa realizə = `hours − after_opt`.
2. **"Fərqlidir/Saxla" sənədin sahəsində** (`health_ignore`, vergüllə açarlar): ayrıca kolleksiya yoxdur, sinxron/undo/ziddiyyət adi qaydada işləyir, bütün istifadəçilər üçün ümumidir.
3. **"Ə" iki cür normallaşır** (e və a): Farida/Fəridə yalnız ə→a ilə tapılır.
4. **Potensial formulu (§7.8) dəyişmədi:** "Rədd edildi" işlər də potensiala daxildir (formula yalnız `done`-u çıxır). Sahib istəsə rədd edilənlər çıxarıla bilər — rəhbərlik rəqəmini dəyişdiyi üçün razılıq tələb olunur.
5. **"Ayrılmış əməkdaş" yoxlaması `active = false` ilə** — `end_date` sahəsi hələ yoxdur.
6. Dublikat/ID düzəlişləri avtomatik edilmir — rəhbərlik rəqəmini dəyişir (seed-də B-30/B-222, B-32/B-224 aktiv dublikatlardır, saatları iki dəfə sayılır).

## Seed tapıntıları (7)
Farida/Fəridə, Kamila/Kamilə, B-44/B-1770271295121, **B-30/B-222, B-32/B-224 (yeni aşkarlandı)**, P-29 saatı (40 olmalıdır, 200), P-x71 (P-71 ilə eyni).

## Firestore
Yeni kolleksiya/endpoint yoxdur; bütün dəyişikliklər mövcud `/api/ops` diff-i ilə.

## Testlər
Vitest 234 (sağlamlıq tapıntıları, ignore, optimizasiya portfeli, realizə, waterfall körpüsü, server: "Tamamlandı" saat əvəzi/bərpası, v1 yazması v2 sahələrini silmir, ID düzəlişi). Playwright 27 (sağlamlıq: birləşdirmə, dublikat, saxla; portfel: status, saat əvəzi, əlavə), axe 0 ciddi. Tapılan bug: ziddiyyət dialoqu yeni sahələrin etiketi olmadığı üçün çökürdü — düzəldildi.
