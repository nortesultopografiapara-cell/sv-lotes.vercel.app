/**
 * Colunas de companies para geração/preview de contratos — alinhado a Configurações → Empresa.
 */

import {
  COMPANY_SETTINGS_COLUMNS_BASE,
  COMPANY_SETTINGS_COLUMNS_EXTENDED,
} from '@/lib/companySettingsFields';

/** Select único para preview, regeneração enxuta e venda GIS → contrato. */
export const COMPANY_CONTRACT_LOAD_SELECT = `${COMPANY_SETTINGS_COLUMNS_BASE}, ${COMPANY_SETTINGS_COLUMNS_EXTENDED}`;
