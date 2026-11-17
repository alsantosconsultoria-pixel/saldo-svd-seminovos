import { describe, expect, it } from "vitest";
import { proximoDiaUtil } from "./calendario";
describe("vencimentos em dia não útil", () => {
  it("sábado e domingo vão para segunda", () => {
    expect(proximoDiaUtil("2026-11-21")).toBe("2026-11-23");
    expect(proximoDiaUtil("2026-11-22")).toBe("2026-11-23");
  });
  it("feriado vai para o próximo dia útil", () => {
    expect(proximoDiaUtil("2026-12-25")).toBe("2026-12-28");
    expect(proximoDiaUtil("2026-04-03")).toBe("2026-04-06"); // Sexta-feira Santa
    expect(proximoDiaUtil("2026-11-20")).toBe("2026-11-23"); // Consciência Negra
  });
  it("dia útil não muda", () => expect(proximoDiaUtil("2026-11-17")).toBe("2026-11-17"));
});
