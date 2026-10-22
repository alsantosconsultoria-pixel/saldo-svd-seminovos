import { describe, expect, it } from "vitest";
import { documentoRelatorio, emailRelatorio } from "./relatorio-email";

describe("compartilhamento local", () => {
  it("abre o destinatário e o resumo no aplicativo de e-mail sem envio automático", () => {
    const url = emailRelatorio(" diretoria@example.com ", "Saldos & ajustes", "Saldo: R$ 150.000,00");
    expect(url.startsWith("mailto:diretoria%40example.com?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject")).toBe("Saldos & ajustes");
    expect(params.get("body")).toContain("Saldo: R$ 150.000,00");
  });
  it("exporta os dados como HTML escapado sem modificar o relatório original", () => {
    const el = document.createElement("article");
    el.className = "treasury-report";
    el.textContent = '<script>alert("x")</script>';
    const doc = documentoRelatorio(el, "Relatório");
    expect(doc.html).toContain("&lt;script&gt;");
    expect(doc.html).not.toContain("<script>");
    expect(el.className).toBe("treasury-report");
  });
});