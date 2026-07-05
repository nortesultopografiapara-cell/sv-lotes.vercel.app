/**
 * Linhas sintéticas a partir dos PDFs enviados (fluxo sem planilha).
 */

import { normalizeLegacyContractPdfFileName } from '@/lib/imports/modules/legacy-contracts/normalize';
import type {
  LegacyContractPdfIndex,
  ParsedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';

export function buildLegacyContractRowsFromPdfIndex(
  pdfIndex: LegacyContractPdfIndex,
): ParsedLegacyContractRow[] {
  const rows: ParsedLegacyContractRow[] = [];
  let lineNumber = 2;

  for (const fileName of pdfIndex.keys()) {
    rows.push({
      lineNumber: lineNumber++,
      raw: { nome_arquivo_pdf: fileName },
      cliente_cpf_cnpj: '',
      cliente_cpf_cnpj_digits: '',
      cliente_email: '',
      cliente_email_normalized: '',
      empreendimento: '',
      empreendimento_normalized: '',
      quadra: '',
      quadra_normalized: '',
      lote: '',
      lote_normalized: '',
      numero_contrato_antigo: '',
      data_contrato_raw: '',
      data_contrato: null,
      status_contrato_raw: '',
      status_contrato: 'ANTIGO',
      nome_arquivo_pdf: fileName,
      nome_arquivo_pdf_normalized: normalizeLegacyContractPdfFileName(fileName),
      observacoes: '',
    });
  }

  return rows;
}
