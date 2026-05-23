export const GLOBAL_MEASUREMENT_FACTOR = 0.9971090670170828;

export function calibrateDistance(value: number): number {
  const corrected = Number((value * GLOBAL_MEASUREMENT_FACTOR).toFixed(2));
  console.log(`[GIS_CALIBRATION] Distance - Raw: ${value}, Corrected: ${corrected}, Factor: ${GLOBAL_MEASUREMENT_FACTOR}`);
  return corrected;
}

export function calibrateArea(value: number): number {
  const corrected = Number((value * GLOBAL_MEASUREMENT_FACTOR).toFixed(2));
  console.log(`[GIS_CALIBRATION] Area - Raw: ${value}, Corrected: ${corrected}, Factor: ${GLOBAL_MEASUREMENT_FACTOR}`);
  return corrected;
}
