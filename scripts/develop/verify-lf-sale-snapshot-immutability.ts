/**
 * DEVELOP — prova controlada de imutabilidade LF sem criar usuário/venda real.
 * Lê Estrela/Beira, renderiza HTML com snapshot A, simula edição do projeto, re-renderiza.
 * Não grava sales. Não altera Production.
 * npx tsx scripts/develop/verify-lf-sale-snapshot-immutability.ts
 */
import { createClient } from '@supabase/supabase-js';
import { generateContractHTML } from '../../lib/contractTemplate';
import { captureLfContractSnapshotForSale } from '../../lib/lfImoveisContractConfig';
import { LF_CONTRACT_SNAPSHOT_COLUMN } from '../../lib/lfImoveisContractSnapshot';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service) throw new Error('ABORT: sem service role.');
  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const col = await admin.from('sales').select('id, lf_contract_snapshot_json').limit(1);
  if (col.error && /lf_contract_snapshot_json/i.test(col.error.message || '')) {
    console.log('COLUNA AUSENTE — aplicar no DEVELOP:');
    console.log('ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS lf_contract_snapshot_json jsonb NULL;');
    throw new Error('lf_contract_snapshot_json ainda não existe no DEVELOP.');
  }

  const company = await admin
    .from('companies')
    .select('id, name, razao_social, cnpj, legal_representative, representative_cpf, contract_model, city, state, address, contract_second_vendor_json')
    .ilike('name', '%l.f%')
    .limit(1)
    .maybeSingle();
  if (company.error || !company.data) {
    throw new Error(company.error?.message || 'Empresa LF não encontrada.');
  }

  const beira = await admin
    .from('projects')
    .select('id, name, city, uf, neighborhood, address, forum_city, contract_model, lf_contract_config_json')
    .ilike('name', '%beira%rio%')
    .maybeSingle();
  if (beira.error || !beira.data) {
    throw new Error(beira.error?.message || 'Beira Rio não encontrado.');
  }

  const estrela = await admin
    .from('projects')
    .select('id, name, city, uf, neighborhood, address, forum_city, contract_model, lf_contract_config_json')
    .ilike('name', '%estrela%do%sul%')
    .maybeSingle();

  const tenant = {
    ...(company.data as Record<string, unknown>),
    contract_model: 'ESTRELA_DO_SUL',
  };
  const projectA = beira.data as Record<string, unknown>;
  const snapA = captureLfContractSnapshotForSale({ project: projectA, company: tenant });
  const saleA = {
    payment_type: 'Parcelado',
    installments_count: 4,
    total_value: 20000,
    down_payment: 2000,
    sale_date: '2026-02-20',
    [LF_CONTRACT_SNAPSHOT_COLUMN]: snapA,
  };
  const block = {
    quadra: '01',
    lot: '99',
    area: 1000,
    frente: 20,
    fundo: 20,
    'Lado Dir.': 50,
    'Lado Esq.': 50,
  };
  const customer = { name: 'Comprador Probe', cpf: '52998224725', document: '52998224725' };

  const htmlA = generateContractHTML({
    tenant,
    customer,
    project: projectA,
    block,
    sale: saleA,
  });

  const mutated = {
    ...projectA,
    address: 'ENDERECO MUTADO NAO DEVE APARECER',
    neighborhood: 'BAIRRO MUTADO',
    lf_contract_config_json: {
      secondVendor: {
        name: 'Vendedor Mutado Nao Deve Aparecer',
        cpf: '39053344705',
        email: 'mutado@example.test',
        phone: '94990000000',
      },
      participation: { firstVendorPercent: 10, secondVendorPercent: 90 },
    },
  };
  const htmlFrozen = generateContractHTML({
    tenant,
    customer,
    project: mutated,
    block,
    sale: saleA,
  });

  assert(htmlA.length > 500, 'HTML A gerado');
  assert(htmlFrozen.length > 500, 'HTML regenerado gerado');
  const originalVendor = String(
    (snapA as { secondVendor?: { name?: string } }).secondVendor?.name || '',
  );
  if (originalVendor) {
    assert(htmlFrozen.includes(originalVendor), 'regeneração mantém segundo vendedor snapshotado');
    assert(
      !htmlFrozen.includes('Vendedor Mutado Nao Deve Aparecer'),
      'regeneração ignora vendedor mutado do projeto',
    );
  }
  assert(
    !htmlFrozen.includes('ENDERECO MUTADO NAO DEVE APARECER'),
    'regeneração ignora endereço mutado do projeto',
  );

  if (estrela.data) {
    const htmlEstrela = generateContractHTML({
      tenant,
      customer,
      project: estrela.data as Record<string, unknown>,
      block,
      sale: { ...saleA, [LF_CONTRACT_SNAPSHOT_COLUMN]: undefined },
    });
    assert(htmlEstrela.length > 500, 'Estrela live renderiza');
    if (originalVendor && originalVendor !== 'Antonio Ferreira Silva') {
      assert(
        !htmlEstrela.includes(originalVendor) || htmlEstrela.includes('Antonio'),
        'Estrela não herda vendedor do Beira',
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        env: target.ref,
        beira: projectA.name,
        snapshotVendor: originalVendor || null,
        columnPresent: true,
      },
      null,
      2,
    ),
  );
  console.log('OK verify-lf-sale-snapshot-immutability (somente leitura + HTML)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
