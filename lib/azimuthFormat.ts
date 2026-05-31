/**
 * Azimute topográfico padrão: DDD°MM'SS"
 */

export function formatAzimuthDms(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return "—";

  let total = ((deg % 360) + 360) % 360;
  let d = Math.floor(total);
  let minFloat = (total - d) * 60;
  let m = Math.floor(minFloat);
  let s = Math.round((minFloat - m) * 60);

  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d = (d + 1) % 360;
  }

  return `${String(d).padStart(3, "0")}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}
