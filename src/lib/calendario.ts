// Calendário de dias úteis: finais de semana e feriados nacionais (fixos + móveis pela Páscoa).
// Vencimentos em dia não útil passam para o próximo dia útil.
const cache = new Map<number, Set<string>>();
const iso = (d: Date) => d.toISOString().slice(0, 10);

function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

export function feriados(ano: number): Set<string> {
  const c = cache.get(ano);
  if (c) return c;
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  const p = pascoa(ano);
  const rel = (n: number) => { const d = new Date(p); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  // Carnaval (seg/ter), Sexta-feira Santa, Corpus Christi
  const s = new Set([...fixos, rel(-48), rel(-47), rel(-2), rel(60)]);
  cache.set(ano, s);
  return s;
}

export function ehDiaUtil(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados(d.getUTCFullYear()).has(data);
}

export function proximoDiaUtil(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const d = new Date(`${data}T12:00:00Z`);
  while (!ehDiaUtil(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

export function somarDias(data: string, n: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

// Desloca o vencimento para o próximo dia útil, guardando o original.
export function ajustarVencimento<T extends { vencimento: string }>(item: T): T & { vencimentoOriginal: string } {
  return { ...item, vencimentoOriginal: item.vencimento, vencimento: proximoDiaUtil(item.vencimento) };
}
