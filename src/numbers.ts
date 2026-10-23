/**
 * Valor digitado pelo usuário: "449", "449,90", "1.299,90", "R$ 199", "449.90".
 * Com vírgula vale o formato brasileiro; sem vírgula o ponto é decimal.
 */
export function parseUserNumber(input: string): number | null {
  let s = input.replace(/R\$|\s/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}
