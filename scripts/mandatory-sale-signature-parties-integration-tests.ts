/**
 * Teste integrado — caminho real createSignaturePartiesAfterSend.
 * Reproduz o bug: select de company com colunas inexistentes → PADRAO falso.
 * npx tsx scripts/mandatory-sale-signature-parties-integration-tests.ts
 */

import { createSignaturePartiesAfterSend } from '../lib/saleContractSignaturePartyFlow';
import { hashSaleSignaturePartyToken } from '../lib/saleContractSignaturePartyTokens';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

type Row = Record<string, unknown>;

function createFakeSupabase(state: {
  company: Row;
  sale: Row;
  customer: Row;
  parties: Row[];
}) {
  const from = (table: string) => {
    const ctx: {
      filters: Record<string, string>;
      mode: 'select' | 'insert' | 'update';
      insertPayload: Row | null;
      selectCols: string;
    } = {
      filters: {},
      mode: 'select',
      insertPayload: null,
      selectCols: '*',
    };

    const api: Record<string, unknown> = {};

    api.select = (cols?: string) => {
      // insert().select() mantém o payload
      if (ctx.mode !== 'insert') ctx.mode = 'select';
      ctx.selectCols = cols || '*';
      return api;
    };
    api.insert = (payload: Row) => {
      ctx.mode = 'insert';
      ctx.insertPayload = payload;
      return api;
    };
    api.update = () => {
      ctx.mode = 'update';
      return api;
    };
    api.eq = (col: string, val: string) => {
      ctx.filters[col] = val;
      return api;
    };
    api.in = () => api;
    api.order = () => api;
    api.maybeSingle = async () => {
      if (table === 'companies') {
        if (
          ctx.selectCols.includes('legal_representative_name') ||
          ctx.selectCols.includes('representative_name')
        ) {
          return {
            data: null,
            error: {
              message: `column companies.legal_representative_name does not exist`,
            },
          };
        }
        return { data: state.company, error: null };
      }
      if (table === 'sales') {
        return { data: state.sale, error: null };
      }
      if (table === 'customers') {
        return { data: state.customer, error: null };
      }
      return { data: null, error: null };
    };
    api.single = async () => {
      if (ctx.mode === 'insert' && table === 'contract_signature_parties') {
        const row = {
          id: `party-${state.parties.length + 1}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          viewed_at: null,
          signed_at: null,
          cancelled_at: null,
          signature_data: {},
          ip_address: null,
          user_agent: null,
          signature_hash: null,
          sent_at: new Date().toISOString(),
          expires_at: null,
          status: 'PENDING',
          ...ctx.insertPayload,
        };
        state.parties.push(row);
        return { data: row, error: null };
      }
      return { data: null, error: { message: 'not found' } };
    };

    const thenable = {
      then(
        resolve: (v: { data: Row[] | null; error: null }) => void,
      ) {
        if (table === 'contract_signature_parties' && ctx.mode === 'select') {
          const sid = ctx.filters.contract_signature_id;
          const rows = state.parties.filter(
            (p) => !sid || String(p.contract_signature_id) === String(sid),
          );
          resolve({ data: rows, error: null });
          return;
        }
        resolve({ data: [], error: null });
      },
    };
    Object.assign(api, thenable);
    return api;
  };

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

async function testCreatePartiesWithRecantoCompanySelectStar() {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-test.vercel.app';
  process.env.NEXT_PUBLIC_PUBLIC_APP_URL = '';

  const state = {
    company: {
      id: 'company-1',
      contract_model: 'RECANTO_PRIMAVERA',
      fantasy_name: 'Recanto',
      name: 'Recanto',
      legal_representative: 'Vendedora',
      representative_cpf: '39053344705',
      email: 'vend@test.com',
    },
    sale: {
      id: 'sale-1',
      sale_spouse_name: 'ROSIVAN DE OLIVEIRA',
      sale_spouse_cpf: '91839424249',
      sale_spouse_phone: '94984461415',
      sale_spouse_email: 'spouse@test.com',
    },
    customer: {
      id: 'cust-1',
      name: 'Severino José de França',
      cpf: '65082028200',
      phone: '94991955918',
      email: 'buyer@test.com',
    },
    parties: [] as Row[],
  };

  const sb = createFakeSupabase(state);
  const buyerToken = 'a'.repeat(64);

  const result = await createSignaturePartiesAfterSend(sb, {
    signature: {
      id: 'sig-1',
      contract_id: 'ct-1',
      tenant_id: 'company-1',
      signature_token: buyerToken,
      signature_status: 'PENDING',
    },
    contractRow: {
      id: 'ct-1',
      company_id: 'company-1',
      tenant_id: 'company-1',
      sale_id: 'sale-1',
      customer_id: 'cust-1',
      generated_html:
        '<div class="sv-contract-recanto-primavera"><p>CÔNJUGE ANUENTE</p></div>',
    },
    buyerToken,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  const roles = result.parties.map((p) => String(p.role)).sort();
  // ordem canônica esperada
  const ordered = result.parties.map((p) => String(p.role));
  assert(
    ordered.join(',') === 'BUYER,SPOUSE,VENDOR' ||
      roles.join(',') === 'BUYER,SPOUSE,VENDOR',
    `esperado BUYER,SPOUSE,VENDOR got ${ordered.join(',')}`,
  );
  assert(result.spouseRequired === true, 'spouseRequired');
  assert(Boolean(result.spouseSignUrl), 'spouseSignUrl');
  assert(
    result.spouseSignUrl !==
      `https://sv-lotes-vercel-test.vercel.app/sign/sale/${buyerToken}`,
    'links distintos',
  );

  console.log('OK testCreatePartiesWithRecantoCompanySelectStar');
}

async function testBrokenCompanySelectWouldHaveFailedBefore() {
  // Garante que select enxuto com coluna fantasma falha no fake
  const state = {
    company: { id: 'c', contract_model: 'RECANTO_PRIMAVERA' },
    sale: { id: 's' },
    customer: { id: 'u' },
    parties: [] as Row[],
  };
  const sb = createFakeSupabase(state);
  const bad = await (sb as any)
    .from('companies')
    .select('id, legal_representative_name')
    .eq('id', 'c')
    .maybeSingle();
  assert(Boolean(bad.error), 'select fantasma deve falhar');
  const good = await (sb as any)
    .from('companies')
    .select('*')
    .eq('id', 'c')
    .maybeSingle();
  assert(Boolean(good.data), 'select * deve funcionar');
  console.log('OK testBrokenCompanySelectWouldHaveFailedBefore');
}

async function main() {
  await testBrokenCompanySelectWouldHaveFailedBefore();
  await testCreatePartiesWithRecantoCompanySelectStar();
  // silence unused
  void hashSaleSignaturePartyToken;
  console.log('\nTodos os testes de integração de parties passaram.');
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
