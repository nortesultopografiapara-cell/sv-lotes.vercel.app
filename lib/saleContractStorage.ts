/**
 * Storage do PDF assinado de contrato de compra e venda.
 * Bucket único e existente no projeto (mesmo do SaaS / company assets).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Bucket padrão — já usado por contratos SaaS e assets da empresa. */
export const SALE_CONTRACT_STORAGE_BUCKET_DEFAULT = 'company-assets';

/**
 * Resolve o bucket de PDF assinado de venda.
 * Override opcional via SALE_CONTRACT_STORAGE_BUCKET (Preview/Produção).
 */
export function getSaleContractBucket(): string {
  const fromEnv = String(process.env.SALE_CONTRACT_STORAGE_BUCKET || '').trim();
  return fromEnv || SALE_CONTRACT_STORAGE_BUCKET_DEFAULT;
}

export function buildSignedSaleContractStoragePath(
  tenantId: string,
  contractNumber: string,
): string {
  const safeName = String(contractNumber || 'contrato').replace(/[^\w-]+/g, '_');
  return `contracts/sale-signed/${tenantId}/${safeName}.pdf`;
}

/**
 * Garante que o bucket existe e é acessível com a service role.
 * Não cria bucket novo automaticamente (evita surpresa em produção).
 */
export async function assertSaleContractBucketReady(
  supabaseAdmin: SupabaseClient,
): Promise<string> {
  const bucket = getSaleContractBucket();
  const { data, error } = await supabaseAdmin.storage.getBucket(bucket);

  if (error || !data) {
    throw new Error(
      `Bucket de contratos de venda indisponível (${bucket}): ${
        error?.message || 'não encontrado'
      }. Configure SALE_CONTRACT_STORAGE_BUCKET ou crie o bucket '${SALE_CONTRACT_STORAGE_BUCKET_DEFAULT}'.`,
    );
  }

  return bucket;
}
