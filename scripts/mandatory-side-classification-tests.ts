/**
 * 7 cenários obrigatórios de classificação de lados.
 *   npx tsx scripts/mandatory-side-classification-tests.ts
 *   npx tsx scripts/mandatory-side-classification-tests.ts [Q02.txt] [Q04.txt]
 */
import fs from "fs";
import path from "path";
import {
  parseLotChunk,
  parseCivil3dTxtLots,
  civil3dParsedToOfficialSegments,
} from "../lib/civil3dTxtParser";
import { getOfficialLotMeasurements } from "../lib/officialLotMeasurements";

const Q02_DEFAULT = path.join(
  "d:",
  "TRABALHOS 2026",
  "CHACARAS MENESES",
  "RR",
  "Q02.txt",
);
const Q04_DEFAULT = path.join(
  "d:",
  "TRABALHOS 2026",
  "CHACARAS MENESES",
  "RR",
  "Q04.txt",
);

type Expect = {
  frente?: number;
  fundo?: number;
  ladoDireito?: number;
  ladoEsquerdo?: number;
  chanfre?: number | null;
  minChanfre?: number;
  curvaLength?: number | null;
  raio?: number | null;
  corda?: number | null;
};

type Case = {
  id: number;
  name: string;
  chunk?: string;
  txtPath?: string;
  lotName?: string;
  block?: Record<string, unknown>;
  expect: Expect;
};

function near(a: number | null | undefined, b: number, tol = 0.06): boolean {
  if (b === 0) {
    return a == null || !Number.isFinite(a) || Math.abs(a) <= tol;
  }
  return a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function extractChunk(text: string, lotName: string): string | null {
  const m = text.match(new RegExp(`Name:\\s*${lotName}\\b`, "i"));
  if (!m || m.index == null) return null;
  const bodyStart = m.index + m[0].length;
  const nextName = text.slice(bodyStart).search(/\nName:\s*\d+/i);
  const body =
    nextName >= 0
      ? text.slice(bodyStart, bodyStart + nextName)
      : text.slice(bodyStart);
  return `${lotName}${body}`;
}

function normalizeFixtureChunk(raw: string): string {
  const m = raw.match(/^Name:\s*(.+)/im);
  if (!m) return raw;
  const label = m[1].trim().split(/\s+/)[0];
  const body = raw.slice(m[0].length);
  return `${label}${body}`;
}

function measuresFromChunk(
  rawChunk: string,
  blockExtra: Record<string, unknown> = {},
) {
  const lot = parseLotChunk(normalizeFixtureChunk(rawChunk));
  if (!lot) throw new Error("parseLotChunk falhou");
  const label = String(lot.name).trim();
  const segments = civil3dParsedToOfficialSegments(lot.segments, label);
  const block: Record<string, unknown> = {
    number: label,
    area: lot.area,
    perimeter: lot.perimeter,
    segments_json: segments,
    ...blockExtra,
  };
  return getOfficialLotMeasurements(block, label);
}

// --- Fixtures sintéticos ---

const RECT_NORMAL = `Name: RET-NORM
Area: 5000.00
Perimeter: 300.00
North: 1000.0000m     East: 500000.0000m

Segment #1  :  Line
Length: 50.000m
North: 1050.0000m     East: 500000.0000m

Segment #2  :  Line
Length: 100.000m
North: 1050.0000m     East: 500100.0000m

Segment #3  :  Line
Length: 50.000m
North: 1000.0000m     East: 500100.0000m

Segment #4  :  Line
Length: 100.000m
North: 1000.0000m     East: 500000.0000m
`;

const CORNER_CHAMFRE_FRONT = `Name: ESQ-FRENTE
Area: 800.00
Perimeter: 120.00
North: 2000.0000m     East: 600000.0000m

Segment #1  :  Line
Length: 40.000m
North: 2040.0000m     East: 600000.0000m

Segment #2  :  Line
Length: 8.000m
North: 2045.6569m     East: 600005.6569m

Segment #3  :  Line
Length: 30.000m
North: 2045.6569m     East: 600035.6569m

Segment #4  :  Line
Length: 50.000m
North: 2000.0000m     East: 600035.6569m

Segment #5  :  Line
Length: 35.6569m
North: 2000.0000m     East: 600000.0000m
`;

const TRIANGULAR = `Name: TRI-3
Area: 1200.00
Perimeter: 190.00
North: 3000.0000m     East: 610000.0000m

Segment #1  :  Line
Length: 50.000m
North: 3050.0000m     East: 610000.0000m

Segment #2  :  Line
Length: 86.023m
North: 3025.0000m     East: 610075.0000m

Segment #3  :  Line
Length: 54.083m
North: 3000.0000m     East: 610000.0000m
`;

/** Chanfre na frente (3 m) e no fundo (2,5 m). */
const TWO_CHANFRES = `Name: DUP-CHAN
Area: 900.00
Perimeter: 115.00
North: 4000.0000m     East: 620000.0000m

Segment #1  :  Line
Length: 20.000m
North: 4020.0000m     East: 620000.0000m

Segment #2  :  Line
Length: 3.000m
North: 4022.1213m     East: 620002.1213m

Segment #3  :  Line
Length: 40.000m
North: 4022.1213m     East: 620042.1213m

Segment #4  :  Line
Length: 2.500m
North: 4020.0000m     East: 620044.0000m

Segment #5  :  Line
Length: 15.000m
North: 4000.0000m     East: 620044.0000m

Segment #6  :  Line
Length: 35.000m
North: 4000.0000m     East: 620000.0000m
`;

const CASES: Case[] = [
  {
    id: 1,
    name: "Lote retangular normal",
    chunk: RECT_NORMAL,
    block: { front_segment_index: 0, frente: 50 },
    expect: {
      frente: 50,
      fundo: 50,
      ladoDireito: 100,
      ladoEsquerdo: 100,
      chanfre: null,
    },
  },
  {
    id: 2,
    name: "Lote de esquina com chanfro na frente",
    chunk: CORNER_CHAMFRE_FRONT,
    block: {
      front_segment_index: 0,
      frente: 40,
      front_street_name: "Rua Esquina",
    },
    expect: {
      frente: 40,
      fundo: 50,
      ladoDireito: 30,
      ladoEsquerdo: 35.66,
      chanfre: 8,
    },
  },
  {
    id: 3,
    name: "Lote com chanfro no fundo (Q02 lote 20)",
    txtPath: Q02_DEFAULT,
    lotName: "20",
    block: {
      front_segment_index: 0,
      frente: 10,
      front_street_name: "Rua Q02",
    },
    expect: {
      frente: 10,
      ladoDireito: 28.34,
      ladoEsquerdo: 30,
      chanfre: 2.15,
      fundo: 8.63,
    },
  },
  {
    id: 4,
    name: "Lote com curva (Q04 lote 30)",
    txtPath: Q04_DEFAULT,
    lotName: "30",
    block: {
      front_segment_index: 0,
      front_street_name: "Rua Q04",
    },
    expect: {
      frente: 39.67,
      fundo: 92.05,
      ladoDireito: 104.18,
      ladoEsquerdo: 0,
      chanfre: null,
      curvaLength: 39.67,
    },
  },
  {
    id: 5,
    name: "Lote com curva (Q04 lote 31)",
    txtPath: Q04_DEFAULT,
    lotName: "31",
    block: {
      front_segment_index: 0,
      front_street_name: "Rua Q04",
    },
    expect: {
      frente: 24.14,
      fundo: 113.88,
      ladoDireito: 92.05,
      ladoEsquerdo: 0,
      chanfre: null,
      curvaLength: 30.56,
    },
  },
  {
    id: 6,
    name: "Lote triangular",
    chunk: TRIANGULAR,
    block: { front_segment_index: 0, frente: 50 },
    expect: {
      frente: 50,
      fundo: 86.02,
      ladoDireito: 54.08,
      ladoEsquerdo: 0,
      chanfre: null,
    },
  },
  {
    id: 7,
    name: "Lote com dois chanfros",
    chunk: TWO_CHANFRES,
    block: {
      front_segment_index: 0,
      frente: 20,
      front_street_name: "Rua Dup",
    },
    expect: {
      frente: 20,
      fundo: 15,
      ladoDireito: 40,
      ladoEsquerdo: 35,
      chanfre: 5.5,
    },
  },
];

function checkExpect(m: ReturnType<typeof getOfficialLotMeasurements>, e: Expect): {
  ok: boolean;
  detail: string;
} {
  const parts: string[] = [];
  let ok = true;

  if (e.frente != null && !near(m.frente, e.frente)) {
    ok = false;
    parts.push(`frente=${m.frente} esperado ${e.frente}`);
  }
  if (e.fundo != null && !near(m.fundo, e.fundo)) {
    ok = false;
    parts.push(`fundo=${m.fundo} esperado ${e.fundo}`);
  }
  if (e.ladoDireito != null && !near(m.ladoDireito, e.ladoDireito)) {
    ok = false;
    parts.push(`latDir=${m.ladoDireito} esperado ${e.ladoDireito}`);
  }
  if (e.ladoEsquerdo != null && !near(m.ladoEsquerdo, e.ladoEsquerdo)) {
    ok = false;
    parts.push(`latEsq=${m.ladoEsquerdo} esperado ${e.ladoEsquerdo}`);
  }
  if (e.chanfre === null) {
    if (m.chanfre != null && (m.chanfre.total ?? 0) > 0.01) {
      ok = false;
      parts.push(`chanfre=${m.chanfre?.total} esperado null`);
    }
  } else if (e.chanfre != null && !near(m.chanfre?.total ?? null, e.chanfre)) {
    ok = false;
    parts.push(`chanfre=${m.chanfre?.total} esperado ${e.chanfre}`);
  }
  if (e.minChanfre != null && (m.chanfre?.total ?? 0) < e.minChanfre) {
    ok = false;
    parts.push(`chanfre ausente`);
  }
  if (e.curvaLength === null) {
    if (m.curva != null && (m.curva.totalLength ?? 0) > 0.01) {
      ok = false;
      parts.push(`curva=${m.curva.totalLength} esperado null`);
    }
  } else if (e.curvaLength != null && !near(m.curva?.totalLength ?? null, e.curvaLength)) {
    ok = false;
    parts.push(`curva=${m.curva?.totalLength} esperado ${e.curvaLength}`);
  }
  if (e.raio != null && !near(m.curva?.radius ?? null, e.raio)) {
    ok = false;
    parts.push(`raio=${m.curva?.radius} esperado ${e.raio}`);
  }
  if (e.corda != null && !near(m.curva?.chord ?? null, e.corda)) {
    ok = false;
    parts.push(`corda=${m.curva?.chord} esperado ${e.corda}`);
  }

  if (ok) {
    parts.push(
      `frente=${m.frente} fundo=${m.fundo} dir=${m.ladoDireito} esq=${m.ladoEsquerdo} chanfre=${m.chanfre?.total ?? 0} curva=${m.curva?.totalLength ?? 0}`,
    );
  }

  return { ok, detail: parts.join("; ") };
}

function run() {
  const q02Path = process.argv[2] ?? Q02_DEFAULT;
  const q04Path = process.argv[3] ?? Q04_DEFAULT;
  const txtCache = new Map<string, string>();

  const loadTxt = (p: string) => {
    if (!txtCache.has(p)) {
      if (!fs.existsSync(p)) throw new Error(`TXT não encontrado: ${p}`);
      txtCache.set(p, fs.readFileSync(p, "utf8"));
    }
    return txtCache.get(p)!;
  };

  let passed = 0;
  let failed = 0;

  console.log("----------------------------------------");
  console.log("Testes obrigatórios — classificação de lados (7 cenários)");
  console.log("----------------------------------------\n");

  for (const c of CASES) {
    try {
      let m: ReturnType<typeof getOfficialLotMeasurements>;
      if (c.chunk) {
        m = measuresFromChunk(c.chunk, c.block ?? {});
      } else if (c.txtPath && c.lotName) {
        const p = c.txtPath.includes("Q04") ? q04Path : q02Path;
        const chunk = extractChunk(loadTxt(p), c.lotName);
        if (!chunk) throw new Error(`Lote ${c.lotName} não encontrado`);
        m = measuresFromChunk(chunk, c.block ?? {});
      } else {
        throw new Error("Caso sem chunk ou TXT");
      }

      const { ok, detail } = checkExpect(m, c.expect);
      if (ok) {
        passed++;
        console.log(`${c.id}. ${c.name}`);
        console.log(`   PASSOU — ${detail}\n`);
      } else {
        failed++;
        console.log(`${c.id}. ${c.name}`);
        console.log(`   FALHOU — ${detail}\n`);
      }
    } catch (err) {
      failed++;
      console.log(`${c.id}. ${c.name}`);
      console.log(`   ERRO — ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log("----------------------------------------");
  console.log(`Total: ${passed} PASSOU / ${failed} FALHOU de ${CASES.length}`);
  console.log("----------------------------------------");

  if (failed > 0) process.exit(1);
}

run();
