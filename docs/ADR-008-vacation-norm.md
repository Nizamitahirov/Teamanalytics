# ADR-008 — Effektiv norma: illik normadan məzuniyyət çıxılır

**Tarix:** 2026-11-20 · **Status:** qəbul edilib (sahibin tələbi) · **Əlaqəli:** SPEC §7.3–7.5, CLAUDE.md §5

## Qərar
Sahib: "1922 saatdan məzuniyyət üçün 30 təqvim günü qədər saat azaldılmalıdır (30 × 8 = 240) və müqayisə bunun əsasında getməlidir; rəhbərlik baxanda aydın başa düşməlidir."

- **Effektiv norma** = `norm − vacation_days × 8`. 2026: **1922 − 240 = 1682 saat / 1 ştat**.
- Yük, tutum, lazım olan ştat, ehtiyat, FTE ekvivalentləri (ləğv, tapşırıq siyahısı, waterfall cədvəli), balanslama — hamısı effektiv norma ilə (`shared/metrics.ts → effectiveNorm`, v1-də `effNorm()`).
- İş həcmi (saat) dəyişmir — məzuniyyət yalnız tutuma təsir edir.
- Ayar: `meta/main.vacation_days` (default 30; sahə yoxdursa da 30). Ayarlar → Ümumi (v2) və Ayarlar → İş norması (v1) — administrator dəyişə bilər; jurnala "effektiv X saat" yazılır.
- Ssenarilərdə "Normanı dəyiş" illik (brutto) normanı dəyişir; məzuniyyət yenə çıxılır.

## Rəhbərlik üçün görünürlük
- Panel (v2): hero-nun altında "Effektiv norma: 1 922 saat − 240 saat məzuniyyət (30 təqvim günü × 8 saat) = 1 682 saat / 1 ştat…"; "Lazım olan ştat" altında "27 850 ÷ 1 682 saat (effektiv norma)".
- Panel (v1, canlı): "Effektiv norma: 1682 saat / 1 ştat (1922 saat − 240 saat məzuniyyət (30 təqvim günü × 8 saat))".
- Əməkdaş profili: "(1 922 − 240 məzuniyyət) = 1 682 saat × ştat 1". Excel (v1) sütunu "Effektiv norma (saat)".

## Rəqəmlərə təsir (seed)
| | Əvvəl (1922) | İndi (1682) |
|---|---|---|
| Lazım olan ştat | 14,49 | **16,56** |
| Mövcud ştat | 18,0 | 18,0 |
| Ehtiyat | +3,5 | **+1,4** |
| Normanı aşan | 3 (Ülkər 113%, Sveta x 113%, Ağaəli 106%) | **7** (Ülkər 129%, Sveta x 129%, Ağaəli 121%, Aysel 114%, Hüseyn 112%, İlahə 110%, Medina 101%) |

## Testlər
- `tests/golden/seed-vacation.test.ts` — yeni qızıl rəqəmlər. Köhnə qızıl testlər silinmədi: `vacation_days: 0` ilə v1 formulası uyğunluğunu yoxlamağa davam edir.
- e2e (v2 və v1) yeni rəqəmlər və izah mətni ilə; yük/histogram vizual etalonları yeniləndi.

## Qeyd
- Yarım ştat: 0,5 × 1682 = 841 saat (məzuniyyət də proporsional).
- Fərdi məzuniyyət/xəstəlik (`absences`, §7.3) gələcəkdə bunun üzərinə əlavə çıxılır.
