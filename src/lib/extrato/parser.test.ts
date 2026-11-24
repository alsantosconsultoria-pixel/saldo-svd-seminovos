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
describe("Itaú aplicação automática", () => {
  it("soma 1,00 + SDO APLIC AUT MAIS AP quando o saldo da conta vem 1,00", () => {
    const e = parseLinhas([
      [{ x: 0, text: "08/11/2026" }, { x: 50, text: "SALDO ANTERIOR" }, { x: 400, text: "37.832,33" }],
      [{ x: 0, text: "09/11/2026" }, { x: 50, text: "PIX ENVIADO" }, { x: 300, text: "-60.848,00" }],
      [{ x: 0, text: "09/11/2026" }, { x: 50, text: "SALDO MOVIMENTAÇÃO CONTA" }, { x: 400, text: "1,00" }],
      [{ x: 0, text: "09/11/2026" }, { x: 50, text: "SDO APLIC AUT MAIS AP" }, { x: 400, text: "26.743,05" }],
    ], "itau.pdf");
    expect(e.saldoFinalInformado).toBe(26744.05);
    expect(e.transacoes.some((t) => t.descricao.includes("SDO APLIC"))).toBe(false);
  });
});
describe("Santander ordem decrescente", () => {
  it("inverte a ordem e usa Saldo de ContaMax como saldo final", () => {
    const e = parseLinhas([
      [{ x: 0, text: "Santander" }],
      [{ x: 0, text: "04/11/2026" }, { x: 50, text: "Pgto Tributo" }, { x: 300, text: "-36,54" }, { x: 400, text: "238,07" }],
      [{ x: 0, text: "04/11/2026" }, { x: 50, text: "Pgto Tributo" }, { x: 300, text: "-36,54" }, { x: 400, text: "274,61" }],
      [{ x: 200, text: "Saldo de ContaMax" }, { x: 400, text: "238,07" }],
    ], "s.pdf");
    expect(e.saldoFinalInformado).toBe(238.07);
    expect(e.saldoInicial).toBe(311.15);
    expect(saldoDiario(e)[0]).toMatchObject({ fechamento: 238.07, ok: true });
  });
});
describe("Sicoob ordem decrescente", () => {
  it("lê valores com C/D colado, inverte ordem decrescente e usa Saldo em conta", () => {
    const e = parseLinhas([
      [{ x: 24, text: "23/11/2026, 08:03" }, { x: 300, text: "Sicoob | Internet Banking" }],
      [{ x: 34, text: "Cooperativa:" }, { x: 364, text: "3031-7 / SICOOB CREDICANOINHAS/SC" }],
      [{ x: 34, text: "Conta:" }, { x: 254, text: "200.938-2 / SVD SEMINOVOS COMERCIO DE VEICULOS LTDA" }],
      [{ x: 34, text: "Periodo:" }, { x: 449, text: "19/11/2026 - 23/11/2026" }],
      [{ x: 37, text: "23/11" }, { x: 69, text: "3178000" }, { x: 146, text: "TARIFA COBRANÇA" }, { x: 514, text: "R$" }, { x: 531, text: "3,40D" }],
      [{ x: 37, text: "23/11" }, { x: 69, text: "3176742" }, { x: 146, text: "CRÉD.LIQUIDAÇÃO COBRANÇA" }, { x: 482, text: "R$" }, { x: 499, text: "100.000,00C" }],
      [{ x: 37, text: "23/11" }, { x: 146, text: "SALDO DO DIA" }, { x: 488, text: "R$" }, { x: 504, text: "99.996,60C" }],
      [{ x: 37, text: "21/08" }, { x: 132, text: "SALDO BLOQUEADO ANTERIOR" }, { x: 518, text: "R$" }, { x: 534, text: "0,00*" }],
      [{ x: 37, text: "21/08" }, { x: 146, text: "SALDO ANTERIOR" }, { x: 514, text: "R$" }, { x: 531, text: "0,00C" }],
      [{ x: 36, text: "Saldo em conta:" }, { x: 514, text: "99.996,60C" }],
      [{ x: 36, text: "Saldo disponível:" }, { x: 514, text: "99.906,60C" }],
    ], "19.11.pdf");
    expect(e.banco).toBe("Sicoob");
    expect(e.agencia).toBe("3031");
    expect(e.conta).toBe("200.938-2");
    expect(e.saldoInicial).toBe(0);
    expect(e.saldoFinalInformado).toBe(99996.6);
    expect(e.transacoes.map((t) => [t.descricao, t.tipo, t.valor])).toEqual([
      ["CRÉD.LIQUIDAÇÃO COBRANÇA", "C", 100000],
      ["TARIFA COBRANÇA", "D", 3.4],
    ]);
    expect(saldoDiario(e)[0]).toMatchObject({ data: "2026-11-23", fechamento: 99996.6, ok: true });
  });
});
