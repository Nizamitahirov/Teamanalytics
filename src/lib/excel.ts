// SheetJS — yalnız lazım olanda CDN-dən (v1 ilə eyni versiya; ilkin bundle-a düşmür — SPEC §4.1, §11).
// CSP-də yalnız https://cdn.sheetjs.com icazəlidir (vite.config.ts).
import type { SheetSpec } from '../../shared/excel';

const SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- SheetJS qlobal API-si tipsizdir */
type XLSX = any;
let promise: Promise<XLSX> | null = null;

export function loadXlsx(): Promise<XLSX> {
  const w = window as unknown as { XLSX?: XLSX };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (!promise)
    promise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = SRC;
      sc.async = true;
      sc.onload = () => resolve(w.XLSX);
      sc.onerror = () => {
        promise = null;
        sc.remove();
        reject(new Error('Excel kitabxanası yüklənmədi — internet bağlantısını yoxlayın'));
      };
      document.head.appendChild(sc);
    });
  return promise;
}

/** Vərəqləri xlsx faylı kimi yükləyir: sütun enləri, rəqəm formatı, avtofiltr, dondurulmuş başlıq. */
export async function downloadWorkbook(sheets: SheetSpec[], filename: string): Promise<void> {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  for (const sh of sheets) {
    const ws = X.utils.aoa_to_sheet(sh.rows);
    ws['!cols'] = sh.widths.map((wch) => ({ wch }));
    const ref = X.utils.decode_range(ws['!ref'] ?? 'A1');
    if (sh.name !== 'Hesabat' && sh.rows.length > 1) {
      ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ref.e.r, c: ref.e.c } }) };
      // Dondurulmuş başlıq (Excel "Freeze panes")
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2' }];
    }
    for (const [c, z] of Object.entries(sh.numFmt ?? {}))
      for (let r = 1; r <= ref.e.r; r++) {
        const cell = ws[X.utils.encode_cell({ r, c: Number(c) })];
        if (cell && cell.t === 'n') cell.z = z;
      }
    X.utils.book_append_sheet(wb, ws, sh.name);
  }
  X.writeFile(wb, filename, { compression: true });
}

/** Faylı oxuyur: vərəq adı → 2D massiv (ilk sətir başlıq). */
export async function readWorkbook(file: File): Promise<{ name: string; rows: unknown[][] }[]> {
  const X = await loadXlsx();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  return (wb.SheetNames as string[]).map((name) => ({
    name,
    rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false }) as unknown[][],
  }));
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const today = () => new Date().toISOString().slice(0, 10);
