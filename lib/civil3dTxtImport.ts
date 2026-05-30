/**
 * Importação TXT Civil 3D — UTM (North=Y, East=X) → GeoJSON [longitude, latitude].
 */

import proj4 from 'proj4';

export const BRAZIL_LAT_MIN = -35;
export const BRAZIL_LAT_MAX = 6;
export const BRAZIL_LON_MIN = -75;
export const BRAZIL_LON_MAX = -30;

export const TXT_IMPORT_INVALID_COORDS_MSG =
  'Coordenada inválida detectada. Verifique zona UTM, datum ou ordem North/East.';

export type UtmZoneInput = string;

export type Civil3dTxtSegment = {
  northing: number;
  easting: number;
  length?: number;
};

export type Civil3dTxtLot = {
  name: string;
  area: number;
  perimeter: number;
  segments: Civil3dTxtSegment[];
  /** GeoJSON ring: [longitude, latitude][] */
  coords: [number, number][];
};

function parseZone(utmZone: UtmZoneInput): { zone: number; south: boolean } {
  const raw = String(utmZone || '22S').trim().toUpperCase();
  const zone = parseInt(raw.replace(/\D/g, ''), 10) || 22;
  const south = raw.includes('S') || !raw.includes('N');
  return { zone, south };
}

/** EPSG SIRGAS 2000 / UTM sul: 31962 = zona 18S, +1 por zona. */
export function getSirgasUtmProj4(utmZone: UtmZoneInput): string {
  const { zone, south } = parseZone(utmZone);
  if (south) {
    const epsg = 31962 + (zone - 18);
    return `EPSG:${epsg}`;
  }
  const epsg = 31960 + (zone - 18);
  return `EPSG:${epsg}`;
}

function ensureProj4Defs(utmZone: UtmZoneInput): string {
  const code = getSirgasUtmProj4(utmZone);
  if (!proj4.defs(code)) {
    const { zone, south } = parseZone(utmZone);
    proj4.defs(
      code,
      `+proj=utm +zone=${zone} ${south ? '+south' : ''} +ellps=GRS80 +units=m +no_defs`,
    );
  }
  return code;
}

export function isValidBrazilLatLon(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) > 1000 || Math.abs(lon) > 1000) return false;
  return (
    lat >= BRAZIL_LAT_MIN &&
    lat <= BRAZIL_LAT_MAX &&
    lon >= BRAZIL_LON_MIN &&
    lon <= BRAZIL_LON_MAX
  );
}

/** Detecta coordenadas UTM brutas salvas por engano no GeoJSON. */
export function looksLikeUtmMetersInGeoJson(lon: number, lat: number): boolean {
  return (
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 1_000_000 ||
    Math.abs(lat) > 1_000_000
  );
}

/**
 * Converte UTM → WGS84 lon/lat.
 * Entrada: X = East, Y = North (metros).
 * Saída: [longitude, latitude].
 */
export function utmToLonLat(
  east: number,
  north: number,
  utmZone: UtmZoneInput,
): [number, number] {
  const from = ensureProj4Defs(utmZone);
  const out = proj4(from, 'EPSG:4326', [east, north]) as [number, number];
  const lon = Number(out[0]);
  const lat = Number(out[1]);
  console.log('UTM original', { north, east });
  console.log('Lat/Lon convertido', { lat, lon });
  return [lon, lat];
}

function pushVertex(
  vertices: Civil3dTxtSegment[],
  north: number,
  east: number,
  length?: number,
): void {
  if (!Number.isFinite(north) || !Number.isFinite(east)) return;
  const seg: Civil3dTxtSegment = { northing: north, easting: east };
  if (length != null && Number.isFinite(length)) seg.length = length;
  vertices.push(seg);
}

/**
 * Extrai vértices pareando North/Y com East/X na ordem do arquivo.
 */
export function extractUtmVerticesFromChunk(chunk: string): Civil3dTxtSegment[] {
  const vertices: Civil3dTxtSegment[] = [];

  const pairedPatterns: Array<{
    re: RegExp;
    eastFirst: boolean;
  }> = [
    {
      re: /North(?:ing)?\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*East(?:ing)?\s*:\s*([0-9.+-]+)/gi,
      eastFirst: false,
    },
    {
      re: /East(?:ing)?\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*North(?:ing)?\s*:\s*([0-9.+-]+)/gi,
      eastFirst: true,
    },
    {
      re: /Norte(?:ing)?\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*Leste(?:ing)?\s*:\s*([0-9.+-]+)/gi,
      eastFirst: false,
    },
    {
      re: /Leste(?:ing)?\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*Norte(?:ing)?\s*:\s*([0-9.+-]+)/gi,
      eastFirst: true,
    },
    {
      re: /Y\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*X\s*:\s*([0-9.+-]+)/gi,
      eastFirst: false,
    },
    {
      re: /X\s*:\s*([0-9.+-]+)\s*(?:\r?\n)+\s*Y\s*:\s*([0-9.+-]+)/gi,
      eastFirst: true,
    },
  ];

  for (const { re, eastFirst } of pairedPatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)) !== null) {
      const a = parseFloat(m[1]);
      const b = parseFloat(m[2]);
      if (eastFirst) pushVertex(vertices, b, a);
      else pushVertex(vertices, a, b);
    }
    if (vertices.length > 0) return vertices;
  }

  const northingMatches = [...chunk.matchAll(/North(?:ing)?\s*:\s*([0-9.+-]+)/gi)];
  const eastingMatches = [...chunk.matchAll(/East(?:ing)?\s*:\s*([0-9.+-]+)/gi)];
  const lengthMatches = [...chunk.matchAll(/Length\s*:\s*([0-9.+-]+)/gi)];
  const n = Math.min(northingMatches.length, eastingMatches.length);
  for (let i = 0; i < n; i++) {
    const north = parseFloat(northingMatches[i][1]);
    const east = parseFloat(eastingMatches[i][1]);
    const len =
      i < lengthMatches.length ? parseFloat(lengthMatches[i][1]) : undefined;
    pushVertex(vertices, north, east, len);
  }

  return vertices;
}

export function closeGeoJsonRing(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, [first[0], first[1]]];
  }
  return coords;
}

export function parseCivil3dTxtFile(
  text: string,
  utmZone: UtmZoneInput,
): Civil3dTxtLot[] {
  const lots: Civil3dTxtLot[] = [];
  const nameChunks = text.split(/Name:\s*/i).slice(1);

  for (const chunk of nameChunks) {
    const name = chunk.split('\n')[0].trim();
    let area = 0;
    let perimeter = 0;

    const areaMatch = chunk.match(/Area:\s*([0-9.+-]+)/i);
    if (areaMatch) area = parseFloat(areaMatch[1]);

    const perimeterMatch = chunk.match(/Perimeter:\s*([0-9.+-]+)/i);
    if (perimeterMatch) perimeter = parseFloat(perimeterMatch[1]);

    const segments = extractUtmVerticesFromChunk(chunk);
    const coords: [number, number][] = [];

    for (const seg of segments) {
      const [lon, lat] = utmToLonLat(seg.easting, seg.northing, utmZone);
      if (!isValidBrazilLatLon(lat, lon)) {
        throw new Error(TXT_IMPORT_INVALID_COORDS_MSG);
      }
      coords.push([lon, lat]);
    }

    if (coords.length >= 3) {
      lots.push({
        name,
        area,
        perimeter,
        segments,
        coords: closeGeoJsonRing(coords),
      });
    }
  }

  return lots;
}

/** GeoJSON [lon, lat] → Leaflet [lat, lon] */
export function geoJsonToLeafletPositions(
  ring: number[][],
): [number, number][] {
  const out: [number, number][] = [];
  for (const c of ring) {
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (looksLikeUtmMetersInGeoJson(lon, lat)) {
      console.warn('GIS_MAP_UTM_RAW_REJECTED', { lon, lat });
      continue;
    }
    out.push([lat, lon]);
  }
  return out;
}
