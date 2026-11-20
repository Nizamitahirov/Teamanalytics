// Qrafiki faylı kimi yükləmə (SPEC §6: "PNG/SVG yüklə").
const download = (href: string, name: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'qrafik';

export function downloadSvg(svg: string, title: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  download(url, `${safe(title)}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG → PNG (2× piksel sıxlığı, səth rəngi ilə). */
export async function downloadPng(svg: string, title: string, background: string) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('svg'));
    img.src = url;
  });
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  download(canvas.toDataURL('image/png'), `${safe(title)}.png`);
}
