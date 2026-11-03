/**
 * DEVELOP — homologação real dos percentuais ESTRELA_DO_SUL.
 * Cria duas vendas GIS novas. NÃO toca a venda 000000008/2026.
 *
 * npx tsx scripts/develop/homolog-estrela-participation-sales.ts --execute
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { executeGisSaleCreate } from '../../lib/gisSaleCreateService';
import { parseLfContractConfigJson } from '../../lib/lfImoveisContractConfig';
import { parseLfContractSnapshotJson } from '../../lib/lfImoveisContractSnapshot';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';

const PROJECT_ID = '760c32d8-4c43-403b-986c-9872011f44cd';
const TENANT_ID = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';
const ADMIN_USER_ID = '6d593a5a-0b4c-49a6-8f41-b8f6ca952203';
const BROKER_ID = '3fd5e6b3-58ff-43c2-86f3-fbbdf90ab1ab';
const SALE_008_ID = 'de794804-6310-4b70-8288-869a83f372ea';
const LOT_A = 'bc067f85-3e00-4b19-b835-57df819557a3'; // quadra 01 lote 38
const LOT_B = '2e9a7c0a-0279-4d04-8225-03fe38521321'; // quadra 01 lote 32
const OPERATIONAL = { first: 40, second: 60 } as const;

function partnershipPhrase(html: string): string | null {
  const m = html.match(
    /(\d{1,3}(?:[.,]\d+)?%\s+do valor e\s+\d{1,3}(?:[.,]\d+)?%\s+ao segundo vendedor)/i,
  );
  return m?.[1] || null;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function customerForm(name: string, cpf: string) {
  return {
    name,
    cpf_cnpj: cpf,
    document: cpf,
    rg: '1234567',
    rg_issuer: 'SSP',
    rg_uf: 'PA',
    phone: '94991000000',
    email: 'homolog.estrela@svlotes.test',
    nationality: 'Brasileira',
    marital_status: 'Solteiro(a)',
    civil_state: 'Solteiro(a)',
    profession: 'Comerciante',
    address: 'Rua Homologacao, 100',
    neighborhood: 'Palmares II',
    city: 'Parauapebas',
    state: 'PA',
    state_uf: 'PA',
    cep: '68515000',
    zip_code: '68515000',
    payment_type: 'À vista',
    down_payment: '0',
    installments_count: '1',
    has_spouse: false,
    sale_spouse_name: '',
    sale_spouse_cpf: '',
  };
}

async function setParticipation(
  admin: ReturnType<typeof createClient>,
  first: number,
  second: number,
) {
  const { data, error } = await admin
    .from('projects')
    .select('lf_contract_config_json')
    .eq('id', PROJECT_ID)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'projeto ausente');
  const current = (data.lf_contract_config_json || {}) as Record<string, unknown>;
  const next = {
    ...current,
    participation: { firstVendorPercent: first, secondVendorPercent: second },
  };
  const upd = await admin
    .from('projects')
    .update({ lf_contract_config_json: next })
    .eq('id', PROJECT_ID)
    .select('lf_contract_config_json')
    .maybeSingle();
  if (upd.error) throw new Error(upd.error.message);
  const parsed = parseLfContractConfigJson(upd.data?.lf_contract_config_json);
  assert(
    parsed.participation?.firstVendorPercent === first &&
      parsed.participation?.secondVendorPercent === second,
    `empreendimento gravado ${first}/${second}`,
  );
}

async function readSaleState(
  admin: ReturnType<typeof createClient>,
  saleId: string,
) {
  const sale = await admin
    .from('sales')
    .select('id, created_at, contract_model, lf_contract_snapshot_json, block_id')
    .eq('id', saleId)
    .maybeSingle();
  if (sale.error || !sale.data) throw new Error(sale.error?.message || 'venda ausente');
  const contract = await admin
    .from('contracts')
    .select('id, contract_number, generated_html, is_current, version, created_at')
    .eq('sale_id', saleId)
    .eq('is_current', true)
    .maybeSingle();
  const html = String(contract.data?.generated_html || '');
  const snap = parseLfContractSnapshotJson(sale.data.lf_contract_snapshot_json);
  return {
    sale: sale.data,
    contract: contract.data,
    html,
    snap,
    phrase: partnershipPhrase(html),
  };
}

async function createSale(
  admin: ReturnType<typeof createClient>,
  lotId: string,
  name: string,
  cpf: string,
) {
  const lot = await admin
    .from('blocks')
    .select('id, number, lot_number, block_name, status, sale_id, tenant_id, project_id, area, price')
    .eq('id', lotId)
    .maybeSingle();
  if (lot.error || !lot.data) throw new Error(lot.error?.message || 'lote ausente');
  if (lot.data.sale_id) throw new Error(`lote ${lotId} já tem venda`);
  const price = Number(lot.data.price) > 0 ? Number(lot.data.price) : 67.34;
  const result = await executeGisSaleCreate(admin, {
    userId: ADMIN_USER_ID,
    userRole: 'ADMIN',
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    lot: lot.data,
    finalPrice: price,
    customerData: customerForm(name, cpf),
    brokerId: BROKER_ID,
    tenantContractModel: 'ESTRELA_DO_SUL',
    isSuperAdmin: true,
  });
  return result;
}

async function writeHomologPdf(html: string, stem: string) {
  const outDir = path.join(process.cwd(), 'scripts', '_fixtures', 'estrela-do-sul');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, `${stem}.html`);
  const pdfPath = path.join(outDir, `${stem}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const chrome =
    [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter((p): p is string => Boolean(p && fs.existsSync(p)))[0] || '';
  if (!chrome) {
    console.log('PDF não gerado (Chrome/Edge ausente):', htmlPath);
    return;
  }
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });
  } finally {
    await browser.close();
  }
  console.log('PDF', pdfPath);
}

async function main() {
  if (!process.argv.includes('--execute')) {
    throw new Error('Passe --execute para criar as vendas de homologação no DEVELOP.');
  }
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service || /SENSITIVE/i.test(env.service)) {
    throw new Error('ABORT: sem service role DEVELOP.');
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.service;
  console.log('ALVO', { ref: target.ref, branch: target.branch });

  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before008 = await admin
    .from('sales')
    .select('lf_contract_snapshot_json')
    .eq('id', SALE_008_ID)
    .maybeSingle();
  const snap008Before = JSON.stringify(before008.data?.lf_contract_snapshot_json || null);

  try {
    await setParticipation(admin, OPERATIONAL.first, OPERATIONAL.second);
    const existingA = await admin
      .from('blocks')
      .select('sale_id')
      .eq('id', LOT_A)
      .maybeSingle();
    const saleAId = String(existingA.data?.sale_id || '');
    const saleA = saleAId
      ? { saleId: saleAId, reused: true }
      : {
          ...(await createSale(
            admin,
            LOT_A,
            'Homolog Percents Quarenta Sessenta',
            '39053344705',
          )),
          reused: false,
        };
    const stateA = await readSaleState(admin, saleA.saleId);
    if (saleA.reused) console.log('VENDA_A reutilizada (já criada neste teste)');
    console.log('VENDA_A', {
      saleId: saleA.saleId,
      contract: stateA.contract?.contract_number,
      snapshot: stateA.snap?.participation,
      phrase: stateA.phrase,
    });
    assert(stateA.snap?.participation?.firstVendorPercent === 40, 'snapshot A = 40');
    assert(stateA.snap?.participation?.secondVendorPercent === 60, 'snapshot A = 60');
    assert(stateA.phrase?.includes('40%') && stateA.phrase?.includes('60%'), 'HTML A = 40/60');
    assert(!stateA.phrase?.includes('30% do valor e 70%'), 'HTML A sem fallback 30/70');
    assert(!String(stateA.html).includes('COMPRADOR 2'), 'sem COMPRADOR 2 sem cônjuge');
    await writeHomologPdf(stateA.html, 'homolog-venda-40-60');

    await setParticipation(admin, 50, 50);
    const saleB = await createSale(
      admin,
      LOT_B,
      'Homolog Percents Cinquenta Cinquenta',
      '52998224725',
    );
    const stateB = await readSaleState(admin, saleB.saleId);
    const stateAAfter = await readSaleState(admin, saleA.saleId);
    console.log('VENDA_B', {
      saleId: saleB.saleId,
      contract: stateB.contract?.contract_number,
      snapshot: stateB.snap?.participation,
      phrase: stateB.phrase,
    });
    assert(stateB.snap?.participation?.firstVendorPercent === 50, 'snapshot B = 50');
    assert(stateB.snap?.participation?.secondVendorPercent === 50, 'snapshot B = 50');
    assert(stateB.phrase?.includes('50%') && stateB.phrase?.includes('50%'), 'HTML B = 50/50');
    assert(
      stateAAfter.snap?.participation?.firstVendorPercent === 40 &&
        stateAAfter.snap?.participation?.secondVendorPercent === 60,
      'venda A permanece 40/60 após empreendimento 50/50',
    );
    assert(
      stateAAfter.phrase?.includes('40%') && stateAAfter.phrase?.includes('60%'),
      'HTML A permanece 40/60',
    );
    await writeHomologPdf(stateB.html, 'homolog-venda-50-50');
  } finally {
    await setParticipation(admin, OPERATIONAL.first, OPERATIONAL.second);
    const after008 = await admin
      .from('sales')
      .select('lf_contract_snapshot_json')
      .eq('id', SALE_008_ID)
      .maybeSingle();
    assert(
      JSON.stringify(after008.data?.lf_contract_snapshot_json || null) === snap008Before,
      'snapshot 000000008/2026 não foi alterado',
    );
    console.log('EMPREENDIMENTO RESTAURADO 40/60');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
