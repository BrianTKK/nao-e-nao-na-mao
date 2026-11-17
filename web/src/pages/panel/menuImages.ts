import { MENU_LIMITS } from '@nenm/shared';

export interface MenuImage {
  contentType: 'image/jpeg';
  base64: string;
}

/**
 * Prepara o cardápio para enviar, no próprio navegador de quem cadastra:
 * - foto: reduz para no máximo 1600 px no lado maior e regrava em JPEG (o que
 *   também tira os metadados, como o GPS da foto);
 * - PDF: cada página vira uma imagem (pdf.js, carregado só aqui). A página de
 *   ajuda só mostra imagens, porque PDF dentro da página não abre no Chrome do
 *   Android e no iPhone mostra só a primeira página.
 */
export async function toMenuImages(file: File, maxPages: number): Promise<MenuImage[]> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return pdfToImages(file, maxPages);
  if (!file.type.startsWith('image/')) throw new Error('unsupported');
  const bitmap = await createImageBitmap(file);
  try {
    return [await encode(bitmap.width, bitmap.height, (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h))];
  } finally {
    bitmap.close();
  }
}

async function pdfToImages(file: File, maxPages: number): Promise<MenuImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  // Sem WebAssembly: a CSP do site não libera 'wasm-unsafe-eval' (o pdf.js usa os decodificadores em JS).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWasm: false }).promise;
  try {
    const out: MenuImage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = MENU_LIMITS.maxSide / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      out.push(await encode(canvas.width, canvas.height, (ctx) => ctx.drawImage(canvas, 0, 0), true));
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

/** Desenha num canvas no tamanho final e grava em JPEG, baixando a qualidade se passar do limite. */
async function encode(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  alreadySized = false,
): Promise<MenuImage> {
  const ratio = alreadySized ? 1 : Math.min(1, MENU_LIMITS.maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Fundo branco: PNG transparente não vira preto no JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MENU_LIMITS.maxBytes) return { contentType: 'image/jpeg', base64: await toBase64(blob) };
  }
  throw new Error('too_large');
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
