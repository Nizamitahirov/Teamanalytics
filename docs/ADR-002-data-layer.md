# ADR-002 — Data qatı: store, sync, versiya ziddiyyəti (Mərhələ 2)

**Tarix:** 2026-11-19 · **Status:** qəbul edilib (PR gözləyir) · **Əlaqəli:** SPEC §4.3, §7, §16

## Qərarlar
1. **Store:** Zustand `createStore` (vanilla) + immer — `src/store/dataStore.ts`. React-dən asılı deyil: node testlərində iki istifadəçi kimi işlədilir. React üçün `useData(selector)` (`src/store/index.ts`), dövr `useSyncLoop` (10 s, yalnız görünən səhifədə, fokusda dərhal, online/offline hadisələri, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y).
2. **v1 davranışı saxlanılır:** commit → diff → növbə → ardıcıl flush (1 təkrar cəhd); növbə boş deyilsə pull serverdən gələni tətbiq etmir; server dəyişikliyi rədd edirsə növbə atılır və tam yükləmə olur.
3. **Diff yalnız dəyişən sahələri göndərir** (v1 tam sətir göndərirdi). Hər op: `v` (gördüyümüz versiya) + `base` (dəyişən sahələrin köhnə dəyərləri, `updated_at/updated_by` xaric).
4. **Versiya `_v`:** hər tapşırıq/əməkdaş yazmasında server `increment` transform-u ilə artırır (v1 klientinin yazmaları da) — miqrasiya skripti olmadan işləyir; `_v`-siz köhnə sənəd = 0.
5. **Ziddiyyət yoxlaması serverdə, Firestore tranzaksiyası ilə:** `beginTransaction → batchGet (dəyişən sənəd sayı qədər oxuma) → resolveVersions → commit` (ABORTED/409 → 3 dəfəyə qədər təkrar). Qayda: `v` bərabərdirsə qəbul; fərqlidirsə, amma dəyişən sahələrin hamısı serverdə hələ `base` dəyərindədirsə → **səssiz birləşdirmə**; əks halda ziddiyyət — həmin sənəd və ona aid jurnal qeydi yazılmır, cavabda `conflicts[]` (serverin versiyası, kim dəyişib).
6. **Özümüzlə ziddiyyət olmasın:** cavabdakı `versions` lokal `_v`-ləri yeniləyir; növbədə köhnə `v` ilə gözləyən op göndərilmə anında yenilənir (`acked` zənciri); geri al/irəli al bərpa olunan sənədlərə cari `_v`-ni köçürür.
7. **Ziddiyyət UI:** dialoq "X bu qeydi sizdən əvvəl dəyişdi" + fərqli sahələr cədvəli + [Onun versiyası] / [Mənimki]. "Mənimki" serverin cari versiyası üzərinə tam sətir yazır və jurnala "Ziddiyyət" qeydi düşür.
8. **Keş: IndexedDB** (`idb-keyval`, açar `wfp.v2`): data + `lastTs` + **göndərilməmiş növbə**. Offline dəyişikliklər səhifə bağlansa da qalır, bağlantı gələndə göndərilir. Çıxışda keş silinir. IndexedDB yoxdursa yaddaşa keçir.
9. **`shared/metrics.ts`** — §7 formulalarının tək mənbəyi. Seed datasında v1 ilə **eyni nəticə** verir (hər iki görünüş × 5 filtr — `tests/golden/seed-v2.test.ts`). v1-dən fərqlər yalnız seed-də olmayan hallarda (SPEC §7-yə uyğun): `fte = 0` → tutum 0 (v1 1 sayırdı); siyahıda olmayan icraçı "mövcud ştat"a düşmür; `active=false` əməkdaş mövcud ştata düşmür; `automation=done` optimizasiya potensialından çıxır; absences / capacity_overrides tutumu azaldır.
10. **Rəqəm formatı:** həmişə öz formatlayıcımız (`shared/format.ts`, minlik U+202F, onluq vergül). Səbəb: Intl `az-AZ` brauzerə görə `27.850` / `27,850` verir — rəhbərliyə gedən rəqəm hər yerdə eyni görünməlidir (SPEC §7.12-dən kiçik kənarlaşma).
11. **Zod klient bundle-ına düşmür:** sabitlər `shared/constants.ts`-də (149 → 123 KB gzip).
12. **Panel (minimal):** hero + 4 KPI + görünüş açarı + normanı aşanlar — metrikaları UI-da göstərmək üçün. Qrafiklər Mərhələ 4.

## Testlər
- `tests/server/sync.test.ts` — iki store real API + mock Firestore ilə: eyni sahə ziddiyyəti, "onun"/"mənimki", səssiz birləşdirmə, silinmiş sənəd, v1 yazmasından sonra köhnə v2 redaktəsi, ardıcıl commit-lər cavabsız, undo/redo serverdə, offline növbə + "yenidən açılış", rədd edilmiş partiya.
- Mock Firestore real kimi davranır: tranzaksiyada oxunan sənəd commit-dən əvvəl dəyişibsə 409 ABORTED.
- Brauzerdə iki istifadəçi ziddiyyət e2e-si redaktə UI-ı (Mərhələ 3) ilə əlavə olunacaq; indi eyni ssenari inteqrasiya testindədir.

## Firestore büdcəsi
- v2 yazması: +1 tranzaksiya, +N oxuma (N = partiyadakı dəyişən sənəd sayı). Adi ötürmə: 1 oxuma.
- v1 yazmaları dəyişmir (tranzaksiya yoxdur).
