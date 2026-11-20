# ADR-011 — Əməliyyat: snapshot, backup, trend, health v2, xəta izləmə, PWA (Mərhələ 9)

**Tarix:** 2026-11-20 · **Status:** qəbul edilib · **Əlaqəli:** SPEC §6.11, §7.10, §14

## Nə quruldu
- **Gündəlik iş** (`server/daily.ts`, `api/cron/daily.ts`, Vercel Cron `50 19 * * *` UTC = Bakı ~23:50): snapshot (`snapshots/{YYYY-MM-DD}`, `shared/snapshot.ts` — Panel ilə eyni `computeMetrics`, effektiv norma ilə: ümumi + şirkətlər üzrə KPI-lar, əməkdaş yükləri), backup (`backups/{date}` meta + `backups/{date}~{n}` gzip+base64 hissələr ≤ 900 KB), təmizlik: 30 gündən köhnə backup-lar, 90 gündən köhnə tombstone-lar, 30 gündən köhnə klient xətaları. Eyni gün təkrar işləsə üzərinə yazır. Snapshot/backup yazıları `meta.updated`-i dəyişmir (klientlər boş yerə delta almır); `meta.last_snapshot/last_backup` yazılır.
- **Tombstone təmizliyi təhlükəsizdir:** `since` 89 gündən köhnədirsə `/api/data` tam yükləmə qaytarır.
- **`/api/snapshots`**: `?from&to` trend (hamı), `?backups=1` siyahı, `?backup=DATE` məzmun (admin), `POST {action:'run'}` "İndi backup et" (admin).
- **Bərpa** (Ayarlar → Data, admin): önizləmə (dəyişən / geri qayıdan / silinən tapşırıqlar, əməkdaş və ayar dəyişiklikləri) → təsdiq qutusu → son təsdiq; əvvəlcə cari vəziyyətin backup-ı alınır; yazma diff op-ları ilə (kolleksiya əvəz olunmur), bir undo addımı, jurnalda "Bərpa".
- **Trend vidjeti** (Panel, son 90 gün, şirkət filtri ilə) və **Dövr müqayisəsi** (`/reports/period`: iki tarix — KPI-lar ümumi/şirkətlər üzrə, əməkdaş yükü Δ p.p., norma dəyişibsə xəbərdarlıq). Snapshot-lar yığılana qədər aydın boş vəziyyət.
- **Health v2** (`GET /api/health`): + `firestore: ok|error`, `lastSnapshot`, `lastBackup`, `cron_secret: var|yoxdur` (Firestore yoxlaması 60 s keş). Ayarlar → Texniki xidmət: klient/server versiyası, vəziyyət, klient xətaları.
- **Xəta izləmə**: `window.error`/`unhandledrejection` → `POST /api/health` (sessiyada ≤ 5, server: istifadəçi başına saatda ≤ 20) → `errors` kolleksiyası (30 gün). Şəbəkə xətaları göndərilmir.
- **Versiya**: UI-da `v2.0.0 · commit` (build anında `VERCEL_GIT_COMMIT_SHA`); `/api/data` cavabında server commit-i — fərqlidirsə "Yeni versiya var — yeniləyin".
- **PWA**: `manifest.webmanifest`, ikonlar (192/512/maskable), `sw.js` — yalnız statik aktivlər (hash-li `/assets` keşdən, səhifələr şəbəkədən, offline → keşlənmiş qabıq); `/api` və `/legacy` heç vaxt. Offline açılış: son profil (ad/rol — sirr yox) localStorage-da, data IndexedDB-də → yalnız oxuma + növbə; çıxışda/401-də silinir.

## Qərarlar
1. **Vercel funksiya limiti (Hobby: 12)** — 12 funksiya: backup-lar `snapshots`-a, klient xətaları `health`-ə birləşdirildi (SPEC-dəki ayrıca `/api/client-error` əvəzinə).
2. **Cron icazəsi:** `CRON_SECRET` varsa `Authorization: Bearer` yoxlanır; yoxdursa yalnız `vercel-cron` agenti qəbul olunur (iş idempotentdir — saxta çağırış yalnız oxuma xərcləyir). Sahibə tövsiyə: `CRON_SECRET` əlavə etmək (məcburi deyil).
3. **Firestore büdcəsi:** gündəlik iş ≈ sənəd sayı oxuma (~400) + ~10 yazma; trend sorğusu ≈ gün sayı (yaddaşda 10 dəq keş); health 60 s keş.

## Testlər
Vitest 255 (Bakı tarixi, backup paketi, cron icazəsi, snapshot = Panel rəqəmləri, backup oxunuşu, meta.updated dəyişmir, təmizlik + idempotentlik, köhnə `since` → tam yükləmə, RBAC, health v2 + xəta limiti, trend qrafiki). Playwright 32 (backup → dəyişiklik → bərpa; texniki xidmət; trend/dövr boş vəziyyəti). Lokal Vercel təqlidində: manifest, service worker, offline açılış (Tapşırıqlar, "Offline").
