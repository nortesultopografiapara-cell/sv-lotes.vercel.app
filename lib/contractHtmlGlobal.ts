/**
 * Utilitários globais — leitura/persistência de HTML de contratos e logs de diagnóstico.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isAraguaiaContractModel,
  isRecantoPrimaveraContractModel,
} from '@/lib/contractModel';

/** Colunas consultadas para HTML salvo (ordem de preferência na leitura). */
export const CONTRACT_HTML_READ_COLUMNS = [
  'generated_html',
  'html_content',
  'contract_html',
  'content',
  'html',
] as const;

export type ContractHtmlReadColumn = (typeof CONTRACT_HTML_READ_COLUMNS)[number];

export function logContractHtmlGlobal(
  channel:
    | 'global-html'
    | 'global-preview'
    | 'global-pdf'
    | 'global-signature'
    | 'global-regenerate',
  step: string,
  extra?: Record<string, unknown>,
) {
  console.log(`[contracts/${channel}]`, step, extra ?? {});
}

/**
 * Indica se o template precisa carregar todos os lotes do projeto.
 * Recanto (layout) e ARAGUAIA (confrontações geométricas = popup GIS)
 * precisam dos vizinhos; sem isso só a frente (rua) costuma resolver.
 */
export function shouldLoadProjectBlocksForContract(
  tenant: Record<string, unknown> | null | undefined,
): boolean {
  return (
    isRecantoPrimaveraContractModel(tenant) || isAraguaiaContractModel(tenant)
  );
}

/** Localiza coluna preenchida e metadados do HTML no row já carregado. */
export function resolveStoredContractHtmlMeta(
  contract: Record<string, unknown> | null | undefined,
): {
  html: string | null;
  column: ContractHtmlReadColumn | null;
  length: number;
  previewStart: string | null;
  previewEnd: string | null;
} {
  if (!contract || typeof contract !== 'object') {
    return { html: null, column: null, length: 0, previewStart: null, previewEnd: null };
  }

  for (const col of CONTRACT_HTML_READ_COLUMNS) {
    const v = contract[col];
    if (typeof v === 'string' && v.trim().length > 0) {
      return {
        html: v,
        column: col,
        length: v.length,
        previewStart: v.slice(0, 200),
        previewEnd: v.slice(-200),
      };
    }
  }

  return { html: null, column: null, length: 0, previewStart: null, previewEnd: null };
}

/** HTML persistido no contrato (todas as colunas legadas). */
export function readStoredContractHtml(
  contract: Record<string, unknown> | null | undefined,
): string | null {
  return resolveStoredContractHtmlMeta(contract).html;
}

/** Mede tamanhos das colunas HTML em um row (diagnóstico). */
export function measureContractHtmlColumns(
  contract: Record<string, unknown> | null | undefined,
): Record<ContractHtmlReadColumn, number> {
  const out = {} as Record<ContractHtmlReadColumn, number>;
  for (const col of CONTRACT_HTML_READ_COLUMNS) {
    const v = contract?.[col];
    out[col] = typeof v === 'string' ? v.length : 0;
  }
  return out;
}

/** Heurística: HTML parece ter corpo contratual (não só chrome). */
export function contractHtmlLooksLikeFullBody(html: string | null | undefined): boolean {
  if (!html || !html.trim()) return false;
  const lower = html.toLowerCase();
  const markers = [
    'cláusula',
    'clausula',
    'promitente',
    'promissário',
    'promissario',
    'contrato de compra',
    'instrumento particular',
    'testemunha',
  ];
  return markers.some((m) => lower.includes(m));
}

/**
 * Carrega row do contrato com select('*') — compatível com schema legado.
 * Evita falha global quando colunas opcionais não existem no select enxuto.
 */
export async function loadContractRowForHtmlAccess(
  supabase: SupabaseClient,
  contractId: string,
): Promise<Record<string, unknown>> {
  const receivedId = String(contractId || '').trim();
  if (!receivedId) {
    throw new Error('ID do contrato vazio.');
  }

  const runLookup = async (field: 'id' | 'contract_number', value: string) => {
    let query = supabase.from('contracts').select('*').eq(field, value);
    if (field === 'contract_number') {
      query = query.order('version', { ascending: false }).limit(1);
    }
    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar contrato: ${error.message}`);
    }
    return data as Record<string, unknown> | null;
  };

  let contract: Record<string, unknown> | null = null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRe.test(receivedId)) {
    contract = await runLookup('id', receivedId);
  }
  if (!contract) {
    contract = await runLookup('contract_number', receivedId);
  }
  if (!contract && !uuidRe.test(receivedId)) {
    contract = await runLookup('id', receivedId);
  }
  if (!contract) {
    throw new Error('Contrato não encontrado.');
  }

  if (!contract.tenant_id && contract.company_id) {
    contract.tenant_id = contract.company_id;
  }

  return contract;
}
