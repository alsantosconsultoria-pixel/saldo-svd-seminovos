import type { Linha } from "./parser";

// Extrai linhas (agrupadas por Y) de um PDF — executado no navegador
export async function pdfParaLinhas(data: ArrayBuffer): Promise<Linha[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data }).promise;
  const linhas: Linha[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const grupos: { y: number; frags: { x: number; text: string }[] }[] = [];
    for (const it of items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const x = it.transform[4]!;
      const y = it.transform[5]!;
      let g = grupos.find((g) => Math.abs(g.y - y) < 3);
      if (!g) grupos.push((g = { y, frags: [] }));
      g!.frags.push({ x, text: it.str.trim() });
    }
    grupos
      .sort((a, b) => b.y - a.y)
      .forEach((g) => linhas.push(g.frags.sort((a, b) => a.x - b.x)));
  }
  return linhas;
}
