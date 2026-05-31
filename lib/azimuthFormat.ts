/**
 * Azimute topográfico padrão: DDD°MM'SS"
 * Reutilizável em prancha PDF, memorial descritivo e exportações técnicas.
 */

/** Azimute (0–360°) entre dois pontos EN — sem arredondar graus decimais. */
export function azimuthFromCoordinates(
  north1: number,
  east1: number,
  north2: number,
  east2: number,
): number {
  const dn = north2 - north1;
  const de = east2 - east1;
  let deg = (Math.atan2(de, dn) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** Azimute a partir de delta local (dx = leste, dy = norte). */
export function azimuthFromSegmentDxDy(dx: number, dy: number): number {
  const rad = Math.atan2(dx, dy);
  return ((rad * 180) / Math.PI + 360) % 360;
}

/**
 * Converte graus decimais para DDD°MM'SS".
 * Arredonda somente no nível de segundos (inteiro), com carry para minuto/grau.
 */
export function formatAzimuthDms(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '—';

  const normalized = ((deg % 360) + 360) % 360;
  let totalSec = Math.round(normalized * 3600);

  if (totalSec >= 360 * 3600) {
    totalSec = 0;
  }

  const d = Math.floor(totalSec / 3600);
  const rem = totalSec % 3600;
  const m = Math.floor(rem / 60);
  const s = rem % 60;

  return `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}
