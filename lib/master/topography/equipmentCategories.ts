/** Categorias patrimoniais — Equipamentos SV Topografia & Projetos (Master). */

export const EQUIPMENT_CATEGORIES = [
  { code: 'DRONE', label: 'Drone' },
  { code: 'GNSS', label: 'GNSS' },
  { code: 'TOTAL_STATION', label: 'Estação Total' },
  { code: 'LEVEL', label: 'Nível' },
  { code: 'SCANNER', label: 'Scanner' },
  { code: 'COMPUTER', label: 'Computador' },
  { code: 'NOTEBOOK', label: 'Notebook' },
  { code: 'PRINTER', label: 'Impressora' },
  { code: 'PLOTTER', label: 'Plotter' },
  { code: 'CONTROLLER', label: 'Controladora' },
  { code: 'ANTENNA', label: 'Antena' },
  { code: 'BATTERY', label: 'Bateria' },
  { code: 'RADIO', label: 'Rádio' },
  { code: 'ACCESSORY', label: 'Acessório' },
  { code: 'OTHER', label: 'Outro' },
] as const;

export type EquipmentCategoryCode = (typeof EQUIPMENT_CATEGORIES)[number]['code'];

export function isEquipmentCategory(value: string): value is EquipmentCategoryCode {
  return EQUIPMENT_CATEGORIES.some((c) => c.code === value);
}

export function equipmentCategoryLabel(code: string): string {
  return EQUIPMENT_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}
