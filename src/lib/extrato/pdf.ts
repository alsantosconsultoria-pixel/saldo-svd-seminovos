import type { Linha } from "./parser";

export interface ResultadoPdf {
  linhas: Linha[];
  ocr: boolean;
}

type Item = { str: string; transform: number[] };

function agrupar(frags: { x: number; y: number; text: string }[], tol: number): Linha[] {
  const grupos: { y: number; frags: { x: number; text: string }[] }[] = [];
  for (const f of frags) {
    let g = grupos.find((g) => Math.abs(g.y - f.y) < tol);
    if (!g) grupos.push((g = { y: f.y, frags: [] }));
    g.frags.push({ x: f.x, text: f.text });
  }
  return grupos.sort((a, b) => a.y - b.y).map((g) => g.frags.sort((a, b) => a.x - b.x));
}

// Extrai linhas de um PDF no navegador. Suporta senha e PDFs escaneados (OCR).
export async function pdfParaLinhas(
  data: ArrayBuffer,
  pedirSenha: (erro: boolean) => Promise<string | null>,
  progresso?: (msg: string) => void,
): Promise<ResultadoPdf> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data });
  task.onPassword = async (update: (s: string) => void, reason: number) => {
    const senha = await pedirSenha(reason === 2);
    if (senha === null) task.destroy();
    else update(senha);
  };
  const doc = await task.promise;

  const linhas: Linha[] = [];
  let ocr = false;
  let tess: import("tesseract.js").Worker | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const textos = (items as Item[]).filter((it) => it.str?.trim());
    if (textos.length > 5) {
      linhas.push(
        ...agrupar(
          textos.map((it) => ({ x: it.transform[4]!, y: -it.transform[5]!, text: it.str.trim() })),
          3,
        ),
      );
      continue;
    }
    // Página sem texto → OCR
    ocr = true;
    progresso?.(`Lendo imagem da página ${p} (OCR)...`);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    if (!tess) {
      const { createWorker } = await import("tesseract.js");
      tess = await createWorker("por");
    }
    const { data: res } = await tess.recognize(canvas, {}, { blocks: true });
    const frags: { x: number; y: number; text: string }[] = [];
    for (const b of res.blocks ?? [])
      for (const par of b.paragraphs)
        for (const ln of par.lines) {
          // junta palavras próximas em frases; colunas distantes viram fragmentos separados
          let atual: { x: number; y: number; text: string; fim: number } | null = null;
          const h = ln.bbox.y1 - ln.bbox.y0;
          for (const w of ln.words) {
            if (atual && w.bbox.x0 - atual.fim < h * 1.2) {
              atual.text += " " + w.text;
              atual.fim = w.bbox.x1;
            } else {
              if (atual) frags.push(atual);
              atual = { x: w.bbox.x0 / 3, y: ln.bbox.y0 / 3, text: w.text, fim: w.bbox.x1 };
            }
          }
          if (atual) frags.push(atual);
        }
    linhas.push(...agrupar(frags, 4));
  }
  if (tess) await tess.terminate();
  return { linhas, ocr };
}
