import { extractAsin, isAmazonBrHost } from "./amazon/asin.ts";

export const MAX_IMPORT = 200;

export interface ParsedImport {
  asins: string[];
  duplicadosNoArquivo: number;
  invalidos: number;
  outrosPaises: number;
}

const ASIN = /^[A-Z0-9]{10}$/;
const HEADERS = new Set(["ASIN", "ASINS", "CODIGO", "CÓDIGO"]);

/**
 * Lê uma lista de ASINs: o CSV de exportação do Keepa (coluna "ASIN" entre aspas, sem domínio),
 * ASINs soltos ou links da Amazon. Tolera BOM, aspas, vírgula, ponto e vírgula e colunas extras
 * (tudo que não parece ASIN conta como inválido, exceto o cabeçalho).
 */
export function parseKeepaList(texto: string): ParsedImport {
  const out: ParsedImport = { asins: [], duplicadosNoArquivo: 0, invalidos: 0, outrosPaises: 0 };
  const seen = new Set<string>();
  const add = (a: string) => {
    if (seen.has(a)) out.duplicadosNoArquivo++;
    else {
      seen.add(a);
      out.asins.push(a);
    }
  };
  for (const raw of texto.replace(/^﻿/, "").split(/[\s,;]+/)) {
    const tok = raw.replace(/^["']+|["']+$/g, "").trim();
    if (!tok) continue;
    if (/^https?:\/\//i.test(tok)) {
      let host = "";
      try {
        host = new URL(tok).hostname.toLowerCase();
      } catch {
        /* inválido abaixo */
      }
      const asin = extractAsin(tok);
      if (host && !isAmazonBrHost(host) && /(^|\.)amazon\./.test(host)) out.outrosPaises++;
      else if (asin && isAmazonBrHost(host)) add(asin);
      else out.invalidos++;
      continue;
    }
    const up = tok.toUpperCase();
    if (ASIN.test(up) && !HEADERS.has(up)) add(up);
    else if (!HEADERS.has(up)) out.invalidos++;
  }
  return out;
}
