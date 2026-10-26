import { describe, expect, it } from "vitest";
import { parseLinhas, saldoDiario, type Extrato } from "./parser";
import { ultimoSaldoExtrato } from "../tratativas";

describe("Extrato sem fechamento", () => {
  it("lê saldo anterior e movimentações sem inventar um saldo informado", () => {
    const extrato = parseLinhas([
      [{ x: 0, text: "26/10/2026" }, { x: 50, text: "SALDO ANTERIOR" }, { x: 250, text: "1.000,00" }],
      [{ x: 0, text: "26/10/2026" }, { x: 50, text: "PIX RECEBIDO" }, { x: 250, text: "250,50 C" }],
      [{ x: 0, text: "26/10/2026" }, { x: 50, text: "PIX ENVIADO" }, { x: 250, text: "125,25 D" }],
    ], "parcial.pdf");
    expect(extrato.saldoFinalInformado).toBeNull();
    expect(ultimoSaldoExtrato(extrato)).toEqual({ saldo: 1125.25, data: "2026-10-26", parcial: true });
    expect(saldoDiario(extrato)[0]?.fechamento).toBe(1125.25);
  });
  it("continua o dia incompleto desde o último saldo confirmado e preserva a conferência", () => {
    const extrato: Extrato = { id: "1", banco: "Banco", agencia: "1", conta: "1", titular: "", arquivo: "", importadoEm: "", saldoInicial: 0, dataSaldoInicial: "2026-10-25", saldoFinalInformado: 1000, saldosInformados: [{ data: "2026-10-25", saldo: 1000 }], transacoes: [{ id: "d", data: "2026-10-26", descricao: "Débito", documento: "", contraparte: "", valor: 125.25, tipo: "D" }] };
    const dias = saldoDiario(extrato);
    expect(dias[0]?.ok).toBe(false);
    expect(dias[1]?.abertura).toBe(1000);
    expect(dias[1]?.fechamento).toBe(874.75);
    expect(dias[1]?.informado).toBeNull();
  });
});