/**
 * Diagnóstico temporário — corretor no contrato RECANTO_PRIMAVERA.
 * Uso:
 *   npx tsx scripts/diagnose-recanto-broker-contract.ts 000000013/2026
 *   npx tsx scripts/diagnose-recanto-broker-contract.ts --quadra 01 --lote 40
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { enrichSaleWithBrokerForContract } from '../lib/saleBrokerSnapshot';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildFreshSaleContractHtml, loadSaleContractContext } from '../lib/contractRegeneration';

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.production.local');
loadEnvFile('.env.local');

const CONTRACT_NUMBER = process.argv[2]?.startsWith('--') ? null : process.argv[2];
const quadraArgIdx = process.argv.indexOf('--quadra');
const loteArgIdx = process.argv.indexOf('--lote');
const QUADRA = quadraArgIdx >= 0 ? process.argv[quadraArgIdx + 1] : null;
const LOTE = loteArgIdx >= 0 ? process.argv[loteArgIdx + 1] : null;

function clean(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function pickField(row: Record<string, unknown> | null | undefined, key: string) {
  if (!row) return null;
  const value = row[key];
  return value == null || value === '' ? null : value;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  let contract: Record<string, unknown> | null = null;

  if (CONTRACT_NUMBER) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_number', CONTRACT_NUMBER)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    contract = (data as Record<string, unknown>) || null;
  } else if (QUADRA && LOTE) {
    const { data: blocks, error: blockErr } = await supabase
      .from('blocks')
      .select('id, block, block_name, quadra, number, lot, contract_id, sale_id, broker_id')
      .or(`number.eq.${LOTE},lot.eq.${LOTE}`)
      .limit(50);
    if (blockErr) throw new Error(blockErr.message);
    const blockRow = (blocks || []).find((row) => {
      const q = clean(row.block || row.block_name || row.quadra).replace(/^0+/, '');
      const targetQ = clean(QUADRA).replace(/^0+/, '');
      const lot = clean(row.number || row.lot).replace(/^0+/, '');
      const targetL = clean(LOTE).replace(/^0+/, '');
      return q === targetQ && lot === targetL;
    }) as Record<string, unknown> | undefined;

    if (!blockRow?.contract_id) {
      console.error('Lote não encontrado ou sem contract_id', { QUADRA, LOTE, blocks });
      process.exit(1);
    }

    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', blockRow.contract_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    contract = (data as Record<string, unknown>) || null;
  } else {
    console.error(
      'Uso: npx tsx scripts/diagnose-recanto-broker-contract.ts 000000013/2026',
    );
    console.error(
      ' ou: npx tsx scripts/diagnose-recanto-broker-contract.ts --quadra 01 --lote 40',
    );
    process.exit(1);
  }

  if (!contract?.id) {
    console.error('Contrato não encontrado');
    process.exit(1);
  }

  const saleId = clean(contract.sale_id);
  const blockId = clean(contract.block_id);
  const tenantId = clean(contract.tenant_id || contract.company_id);

  let sale: Record<string, unknown> = {};
  if (saleId) {
    const { data } = await supabase.from('sales').select('*').eq('id', saleId).maybeSingle();
    sale = (data as Record<string, unknown>) || {};
  }

  let block: Record<string, unknown> = {};
  if (blockId) {
    const { data } = await supabase.from('blocks').select('*').eq('id', blockId).maybeSingle();
    block = (data as Record<string, unknown>) || {};
  }

  const { data: commissions } = await supabase
    .from('broker_commissions')
    .select('id, broker_id, sale_id, status, created_at')
    .eq('sale_id', saleId || '00000000-0000-0000-0000-000000000000');

  const brokerIds = new Set<string>();
  for (const id of [
    contract.broker_id,
    sale.broker_id,
    block.broker_id,
    ...(commissions || []).map((c) => c.broker_id),
  ]) {
    const cleanId = clean(id);
    if (cleanId) brokerIds.add(cleanId);
  }

  const brokerRows: Record<string, unknown>[] = [];
  for (const brokerId of brokerIds) {
    const { data } = await supabase
      .from('brokers')
      .select('id, name, cpf, creci, role, tenant_id, active')
      .eq('id', brokerId)
      .maybeSingle();
    if (data) brokerRows.push(data as Record<string, unknown>);
  }

  const enrichedSale = await enrichSaleWithBrokerForContract(supabase, sale, {
    contract,
    block,
  });

  const generatedHtml = clean(contract.generated_html);
  const htmlHasCorretorTitle = generatedHtml.includes('CORRETOR');
  const htmlHasBrokerName = brokerRows.some((b) =>
    generatedHtml.toLowerCase().includes(clean(b.name).toLowerCase()),
  );

  let regenHtml = '';
  if (tenantId) {
    try {
      const ctx = await loadSaleContractContext(supabase, String(contract.id));
      const fresh = await buildFreshSaleContractHtml(supabase, ctx, {
        contractTenantId: tenantId,
        activeTenantId: tenantId,
        callerRole: 'SUPER_ADMIN',
      });
      regenHtml = fresh.html;
    } catch (err) {
      regenHtml = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const regenHasBrokerName = brokerRows.some((b) =>
    regenHtml.toLowerCase().includes(clean(b.name).toLowerCase()),
  );

  console.log('=== DIAGNÓSTICO CORRETOR RECANTO ===');
  console.log(JSON.stringify({
    contract: {
      id: contract.id,
      contract_number: contract.contract_number,
      version: contract.version,
      status: contract.status,
      is_current: contract.is_current,
      broker_id: pickField(contract, 'broker_id'),
      broker_name: pickField(contract, 'broker_name'),
      sale_id: pickField(contract, 'sale_id'),
      block_id: pickField(contract, 'block_id'),
      generated_html_length: generatedHtml.length,
      generated_html_has_corretor: htmlHasCorretorTitle,
      generated_html_has_broker_name: htmlHasBrokerName,
    },
    sale: {
      id: pickField(sale, 'id'),
      broker_id: pickField(sale, 'broker_id'),
      broker_name: pickField(sale, 'broker_name'),
    },
    block: {
      id: pickField(block, 'id'),
      quadra: pickField(block, 'block') || pickField(block, 'block_name') || pickField(block, 'quadra'),
      lote: pickField(block, 'number') || pickField(block, 'lot'),
      broker_id: pickField(block, 'broker_id'),
    },
    broker_commissions: (commissions || []).map((c) => ({
      id: c.id,
      broker_id: c.broker_id,
      status: c.status,
      created_at: c.created_at,
    })),
    brokers: brokerRows.map((b) => ({
      id: b.id,
      name: b.name,
      active: b.active,
      tenant_id: b.tenant_id,
    })),
    enriched_sale: {
      broker_id: pickField(enrichedSale, 'broker_id'),
      broker_name: pickField(enrichedSale, 'broker_name'),
      brokers_name: pickField(
        enrichedSale.brokers as Record<string, unknown> | undefined,
        'name',
      ),
    },
    regeneration_preview: {
      html_length: regenHtml.startsWith('ERROR:') ? 0 : regenHtml.length,
      has_corretor: regenHtml.includes('CORRETOR'),
      has_broker_name: regenHasBrokerName,
      error: regenHtml.startsWith('ERROR:') ? regenHtml : null,
    },
  }, null, 2));

  if (brokerRows[0]?.name) {
    const brokerName = clean(brokerRows[0].name);
    const testHtml = generateContractHTML({
      tenant: { contract_model: 'RECANTO_PRIMAVERA', name: 'TEST' },
      customer: { name: 'Cliente Teste', document: '12345678901' },
      project: { name: 'Recanto', city: 'Parauapebas', uf: 'PA' },
      block: { quadra: '1', lot: '40', area: 300 },
      sale: enrichedSale,
    });
    console.log('=== PREVIEW HTML ENRIQUECIDO ===');
    console.log({
      contains_corretor: testHtml.includes('CORRETOR'),
      contains_broker_name: testHtml.toLowerCase().includes(brokerName.toLowerCase()),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
