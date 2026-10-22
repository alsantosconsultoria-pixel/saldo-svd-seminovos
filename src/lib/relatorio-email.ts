// Called only from user actions in the browser; never sends financial data to a service.
export function documentoRelatorio(element: HTMLElement, titulo: string) {
  const copia = element.cloneNode(true) as HTMLElement;
  const originais = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const copias = [copia, ...copia.querySelectorAll<HTMLElement>("*")];
  originais.forEach((origem, i) => {
    const destino = copias[i];
    if (!destino) return;
    const estilo = getComputedStyle(origem);
    for (const propriedade of ["display", "color", "background-color", "font-family", "font-size", "font-weight", "line-height", "text-align", "white-space", "overflow-wrap", "padding", "margin", "border", "border-top", "border-bottom", "border-left", "border-right", "border-collapse", "border-spacing", "width", "max-width", "height", "min-height", "box-sizing", "grid-template-columns", "gap", "flex-wrap", "align-items", "justify-content", "vertical-align", "fill", "stroke", "opacity"]) {
      destino.style.setProperty(propriedade, estilo.getPropertyValue(propriedade));
    }
    destino.removeAttribute("class");
    destino.removeAttribute("id");
    destino.style.removeProperty("animation");
    destino.style.removeProperty("transition");
  });
  copia.style.width = "100%";
  copia.style.maxWidth = "1120px";
  const doc = document.implementation.createHTMLDocument(titulo);
  doc.documentElement.lang = "pt-BR";
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.prepend(charset);
  doc.body.appendChild(copia);
  return { html: `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`, texto: element.innerText };
}

export function emailRelatorio(destinatario: string, titulo: string, resumo: string) {
  const corpo = `Prezados,\n\nEncaminho o ${titulo} para apreciação.\n\n${resumo}\n\nO relatório completo segue em anexo ou abaixo.\n\nSantos Finance Consultoria · Grupo SVD`;
  return `mailto:${encodeURIComponent(destinatario.trim())}?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(corpo)}`;
}