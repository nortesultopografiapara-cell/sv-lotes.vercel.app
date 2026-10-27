/**
 * IDs C6 já emitidos na homologação Sandbox.
 * B_01 fica reservado para B_05/B_06. B_04 não altera nenhum destes.
 */

export const C6_HOMOLOG_B01_BANK_SLIP_ID = '01M5YPX04ZB8H14XAPJDA8MRV8';
export const C6_HOMOLOG_B02_BANK_SLIP_ID = '01M5YW8FHF9FJGW4J0X2TXQCGR';
export const C6_HOMOLOG_B03_BANK_SLIP_ID = '01M5YXHWK4VAPWZM59J655WN19';

export const C6_HOMOLOG_PROTECTED_BANK_SLIP_IDS = [
  C6_HOMOLOG_B01_BANK_SLIP_ID,
  C6_HOMOLOG_B02_BANK_SLIP_ID,
  C6_HOMOLOG_B03_BANK_SLIP_ID,
] as const;

export function isC6HomologProtectedBankSlipId(id: string): boolean {
  const value = String(id || '').trim();
  return C6_HOMOLOG_PROTECTED_BANK_SLIP_IDS.some((protectedId) => protectedId === value);
}
