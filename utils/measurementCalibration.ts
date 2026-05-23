export const GLOBAL_MEASUREMENT_FACTOR = 1.0;

export function calibrateDistance(value: number): number {
  const corrected = Number((value * GLOBAL_MEASUREMENT_FACTOR).toFixed(2));
  console.log(`[GIS_CALIBRATION] Distance - Raw: ${value}, Corrected: ${corrected}, Factor: ${GLOBAL_MEASUREMENT_FACTOR}`);
  return corrected;
}

export function calibrateArea(value: number): number {
  const corrected = Number(value.toFixed(2));
  console.log(`[GIS_CALIBRATION] Area - Raw: ${value}, Corrected: ${corrected} (Removed calibration factor as requested)`);
  return corrected;
}
