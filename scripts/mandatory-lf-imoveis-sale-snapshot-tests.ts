/**
 * Fase 3 — snapshot/imutabilidade contratual LF Imóveis por venda.
 * npx tsx scripts/mandatory-lf-imoveis-sale-snapshot-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildEstrelaDoSulEsignVendorPartyInputs } from '../lib/estrelaDoSulContractEsign';
import {
  captureLfContractSnapshotForSale,
  LF_PARTICIPATION_INCOMPLETE_MESSAGE,
  resolveLfContractConfig,
} from '../lib/lfImoveisContractConfig';
import {
  applyLfSnapshotProjectToRecord,
  hasLfContractSnapshot,
  LF_CONTRACT_SNAPSHOT_COLUMN,
  parseLfContractSnapshotJson,
} from '../lib/lfImoveisContractSnapshot';
import { formatEstrelaEnterpriseLocation } from '../lib/estrelaDoSulContractFormat';
import { SALES_UPDATE_FORBIDDEN_FIELDS } from '../lib/salesWriteSchema';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const root = path.join(__dirname, '..');
function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const COMPANY = {
  name: 'L.F. IMOVEIS LTDA',
  razao_social: 'L.F. IMOVEIS LTDA',
  cnpj: '47052349000130',
  legal_representative: 'Luzia Felipe',
  representative_cpf: '11144477735',
  contract_model: 'ESTRELA_DO_SUL',
  city: 'Parauapebas',
  state: 'PA',
  address: 'Rua 24 de Marco, N 99',
  contract_second_vendor_json: {
    name: 'Antonio Ferreira Silva',
    cpf: '71877312215',
    email: 'antonio@estrela.test',
    phone: '94991001122',
  },
};

const VENDOR_B = {
  name: 'Bruno Beira Ficticio',
  cpf: '39053344705',
  rg: '4455667',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'Brasileiro',
  maritalStatus: 'Solteiro',
  profession: 'Comerciante',
  email: 'bruno.beira@example.test',
  phone: '94990001122',
  address: 'Rua Ficticia, 10',
};

const VENDOR_C = {
  name: 'Carla Beira Nova',
  cpf: '39053344705',
  rg: '9988776',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'Brasileira',
  maritalStatus: 'Casada',
  profession: 'Empresaria',
  email: 'carla.beira@example.test',
  phone: '94990002233',
  address: 'Rua Nova, 20',
};

const BLOCK = {
  quadra: '01',
  lot: '13',
  area: 1000,
  frente: 20,
  fundo: 20,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
};

const SALE_BASE = {
  payment_type: 'Parcelado',
  installments_count: 4,
  total_value: 20000,
  down_payment: 2000,
  sale_date: '2026-02-20',
};

function html(params: {
  project: Record<string, unknown>;
  sale?: Record<string, unknown>;
  tenant?: Record<string, unknown>;
}) {
  return generateContractHTML({
    tenant: params.tenant || COMPANY,
    customer: { name: 'Comprador', cpf: '52998224725', document: '52998224725' },
    project: params.project,
    block: BLOCK,
    sale: { ...SALE_BASE, ...(params.sale || {}) },
  });
}

const BEIRA_A = {
  name: 'Chacreamento Beira Rio',
  city: 'Parauapebas',
  uf: 'PA',
  neighborhood: 'Beira A',
  address: 'Travessa A, s/n',
  forum_city: 'Parauapebas',
  contract_model: 'ESTRELA_DO_SUL',
  lf_contract_config_json: {
    secondVendor: VENDOR_B,
    participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
  },
};

const BEIRA_B = {
  ...BEIRA_A,
  neighborhood: 'Beira B',
  address: 'Travessa B, 99',
  lf_contract_config_json: {
    secondVendor: VENDOR_C,
    participation: { firstVendorPercent: 30, secondVendorPercent: 70 },
  },
};

const ESTRELA = {
  name: 'Chacreamento Estrela do Sul',
  city: 'Parauapebas',
  uf: 'PA',
  neighborhood: 'Nova Carajas',
  address: 'PA-275, km 12',
  forum_city: 'Parauapebas',
  contract_model: 'ESTRELA_DO_SUL',
};

console.log('\n=== migration aditiva ===');
{
  const sql = read('supabase/migrations/20261027120000_sales_lf_contract_snapshot_json.sql');
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert(executable.includes('ADD COLUMN IF NOT EXISTS lf_contract_snapshot_json'), 'ADD COLUMN nullable');
  assert(!/UPDATE\s+public\.sales/i.test(executable), 'sem UPDATE/backfill');
  assert(!/DROP\s+COLUMN/i.test(executable), 'sem DROP');
  assert(!/RENAME/i.test(executable), 'sem RENAME');
}

console.log('\n=== ponto de congelamento ===');
{
  const gis = read('lib/gisSaleCreateService.ts');
  assert(gis.includes('captureLfContractSnapshotForSale'), 'GIS captura snapshot LF');
  assert(gis.includes('lf_contract_snapshot_json'), 'grava na venda');
  assert(
    gis.indexOf('lf_contract_snapshot_json') < gis.indexOf("logSaleStep('generate_contract'"),
    'snapshot antes de gerar o contrato',
  );
  assert(gis.includes("=== 'ESTRELA_DO_SUL'"), 'somente modelo LF');
  const edit = read('lib/salesWriteSchema.ts');
  assert(
    edit.includes("'lf_contract_snapshot_json'"),
    'edição de venda proíbe sobrescrever snapshot',
  );
  assert(
    SALES_UPDATE_FORBIDDEN_FIELDS.includes('lf_contract_snapshot_json'),
    'coluna no forbidden do patch oficial',
  );
  const regen = read('lib/contractRegeneration.ts');
  assert(
    !regen.includes('lf_contract_snapshot_json:'),
    'regeneração não regrava snapshot da venda',
  );
}

console.log('\n=== Momento A: Beira captura vendedor B / 25/75 / endereço A ===');
const snapA = captureLfContractSnapshotForSale({
  project: BEIRA_A,
  company: COMPANY,
});
assert(hasLfContractSnapshot(snapA), 'snapshot A existe');
const parsedA = parseLfContractSnapshotJson(snapA);
assert(parsedA?.secondVendor.name === VENDOR_B.name, 'snapshot A vendedor B');
assert(parsedA?.participation?.firstVendorPercent === 25, 'snapshot A 25');
assert(parsedA?.participation?.secondVendorPercent === 75, 'snapshot A 75');
assert(parsedA?.project.address === 'Travessa A, s/n', 'snapshot A endereço');
assert(parsedA?.project.neighborhood === 'Beira A', 'snapshot A bairro');

const saleA = { ...SALE_BASE, [LF_CONTRACT_SNAPSHOT_COLUMN]: snapA };
const htmlA = html({ project: BEIRA_A, sale: saleA });
assert(htmlA.includes(VENDOR_B.name), 'contrato A tem vendedor B');
assert(htmlA.includes('25%') && htmlA.includes('75%'), 'contrato A 25/75');
assert(htmlA.includes('Travessa A, s/n'), 'contrato A endereço A');
assert(htmlA.includes('Beira A'), 'contrato A bairro A');
assert(!htmlA.includes(VENDOR_C.name), 'contrato A sem vendedor C');

const esignA = buildEstrelaDoSulEsignVendorPartyInputs({
  company: COMPANY,
  project: BEIRA_A,
  sale: saleA,
});
assert(esignA.length === 2, 'e-sign A 2 VENDOR');
assert(esignA[1].name === VENDOR_B.name, 'e-sign A = mesmo vendedor B do PDF');
assert(esignA[1].email === 'bruno.beira@example.test', 'e-sign A preserva e-mail');

console.log('\n=== Momento B: projeto muda; contrato antigo permanece A ===');
const htmlOldAfterEdit = html({ project: BEIRA_B, sale: saleA });
assert(htmlOldAfterEdit.includes(VENDOR_B.name), 'regenerar A ainda vendedor B');
assert(htmlOldAfterEdit.includes('25%') && htmlOldAfterEdit.includes('75%'), 'regenerar A ainda 25/75');
assert(htmlOldAfterEdit.includes('Travessa A, s/n'), 'regenerar A ainda endereço A');
assert(!htmlOldAfterEdit.includes(VENDOR_C.name), 'regenerar A não puxa vendedor C');
assert(!htmlOldAfterEdit.includes('Travessa B, 99'), 'regenerar A não puxa endereço B');
assert(!htmlOldAfterEdit.includes('Carla Beira Nova'), 'regenerar A sem nome C');

const esignOld = buildEstrelaDoSulEsignVendorPartyInputs({
  company: COMPANY,
  project: BEIRA_B,
  sale: saleA,
});
assert(esignOld[1].name === VENDOR_B.name, 'e-sign antigo permanece B após editar projeto');

console.log('\n=== venda nova depois da alteração usa C / 30/70 / endereço B ===');
const snapB = captureLfContractSnapshotForSale({
  project: BEIRA_B,
  company: COMPANY,
});
const saleB = { ...SALE_BASE, [LF_CONTRACT_SNAPSHOT_COLUMN]: snapB };
const htmlNew = html({ project: BEIRA_B, sale: saleB });
assert(htmlNew.includes(VENDOR_C.name), 'venda nova tem vendedor C');
assert(htmlNew.includes('30%') && htmlNew.includes('70%'), 'venda nova 30/70');
assert(htmlNew.includes('Travessa B, 99'), 'venda nova endereço B');
assert(!htmlNew.includes(VENDOR_B.name), 'venda nova sem vendedor B');

console.log('\n=== Estrela homologado sem snapshot permanece Antônio 30/70 ===');
const htmlEstrelaLive = html({ project: ESTRELA });
assert(htmlEstrelaLive.includes('Antonio Ferreira Silva'), 'Estrela live Antônio');
assert(htmlEstrelaLive.includes('30%') && htmlEstrelaLive.includes('70%'), 'Estrela live 30/70');
assert(!htmlEstrelaLive.includes(VENDOR_B.name), 'Estrela live sem vendedor B');
assert(!htmlEstrelaLive.includes(VENDOR_C.name), 'Estrela live sem vendedor C');

console.log('\n=== nova venda sem percentuais do empreendimento é bloqueada ===');
{
  let blocked = false;
  try {
    captureLfContractSnapshotForSale({
      project: ESTRELA,
      company: COMPANY,
    });
  } catch (error) {
    blocked = String((error as Error).message).includes(LF_PARTICIPATION_INCOMPLETE_MESSAGE);
  }
  assert(blocked, 'sem percentuais no empreendimento não grava snapshot 30/70');
}

console.log('\n=== Teste A/B: 40/60 congelado; empreendimento 50/50 não altera venda A ===');
{
  const project4060 = {
    ...ESTRELA,
    lf_contract_config_json: {
      participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
    },
  };
  const snap4060 = captureLfContractSnapshotForSale({
    project: project4060,
    company: COMPANY,
  });
  const parsed4060 = parseLfContractSnapshotJson(snap4060);
  assert(parsed4060?.participation?.firstVendorPercent === 40, 'snapshot A 40');
  assert(parsed4060?.participation?.secondVendorPercent === 60, 'snapshot A 60');
  const sale4060 = { ...SALE_BASE, [LF_CONTRACT_SNAPSHOT_COLUMN]: snap4060 };
  const html4060 = html({ project: project4060, sale: sale4060 });
  assert(
    html4060.includes('40% do valor e 60% ao segundo vendedor'),
    'capa/cláusula da venda A interpola 40/60',
  );

  const project5050 = {
    ...ESTRELA,
    lf_contract_config_json: {
      participation: { firstVendorPercent: 50, secondVendorPercent: 50 },
    },
  };
  const htmlAAfterEdit = html({ project: project5050, sale: sale4060 });
  assert(
    htmlAAfterEdit.includes('40% do valor e 60% ao segundo vendedor'),
    'contrato A permanece 40/60 após empreendimento 50/50',
  );
  assert(
    !htmlAAfterEdit.includes('50% do valor e 50% ao segundo vendedor'),
    'contrato A não lê 50/50 live',
  );

  const snap5050 = captureLfContractSnapshotForSale({
    project: project5050,
    company: COMPANY,
  });
  const sale5050 = { ...SALE_BASE, [LF_CONTRACT_SNAPSHOT_COLUMN]: snap5050 };
  const html5050 = html({ project: project5050, sale: sale5050 });
  assert(
    html5050.includes('50% do valor e 50% ao segundo vendedor'),
    'venda B posterior interpola 50/50',
  );
  const parsedAAfter = parseLfContractSnapshotJson(sale4060[LF_CONTRACT_SNAPSHOT_COLUMN]);
  assert(parsedAAfter?.participation?.firstVendorPercent === 40, 'snapshot A não mudou');
  assert(parsedAAfter?.participation?.secondVendorPercent === 60, 'snapshot A permanece 60');
}

console.log('\n=== nova venda Estrela congela vendedor da resolução + percentuais do empreendimento ===');
const ESTRELA_CONFIGURED = {
  ...ESTRELA,
  lf_contract_config_json: {
    participation: { firstVendorPercent: 30, secondVendorPercent: 70 },
  },
};
const snapEstrela = captureLfContractSnapshotForSale({
  project: ESTRELA_CONFIGURED,
  company: COMPANY,
});
const saleEstrela = { ...SALE_BASE, [LF_CONTRACT_SNAPSHOT_COLUMN]: snapEstrela };
const companyLater = {
  ...COMPANY,
  contract_second_vendor_json: {
    name: 'Antonio Nao Deve Aparecer No Antigo',
    cpf: '11144477735',
    email: 'novo@estrela.test',
    phone: '94990000000',
  },
};
const htmlEstrelaFrozen = html({
  project: { ...ESTRELA, lf_contract_config_json: { secondVendor: VENDOR_C } },
  sale: saleEstrela,
  tenant: companyLater,
});
assert(htmlEstrelaFrozen.includes('Antonio Ferreira Silva'), 'Estrela snapshotado permanece Antônio');
assert(
  !htmlEstrelaFrozen.includes('Antonio Nao Deve Aparecer No Antigo'),
  'Estrela snapshotado ignora empresa nova',
);
assert(!htmlEstrelaFrozen.includes(VENDOR_C.name), 'Estrela snapshotado ignora projeto novo');

console.log('\n=== isolamento Beira × Estrela ===');
{
  const estrelaResolved = resolveLfContractConfig({
    project: ESTRELA,
    company: COMPANY,
  });
  assert(estrelaResolved.secondVendor.name === 'Antonio Ferreira Silva', 'Estrela isolado');
  const beiraResolved = resolveLfContractConfig({
    project: BEIRA_B,
    company: COMPANY,
  });
  assert(beiraResolved.secondVendor.name === VENDOR_C.name, 'Beira live C');
  const beiraOld = resolveLfContractConfig({
    sale: saleA,
    project: BEIRA_B,
    company: COMPANY,
  });
  assert(beiraOld.secondVendor.name === VENDOR_B.name, 'Beira antigo B via snapshot');
  assert(beiraOld.secondVendorSource === 'sale', 'fonte sale');
  assert(beiraOld.participationSource === 'sale', 'percentuais sale');
}

console.log('\n=== localização usa valores congelados ===');
{
  const overlaid = applyLfSnapshotProjectToRecord({ ...BEIRA_B }, saleA);
  const loc = formatEstrelaEnterpriseLocation(overlaid);
  assert(loc.includes('Travessa A, s/n'), 'composição congelada endereço A');
  assert(loc.includes('Beira A'), 'composição congelada bairro A');
  assert(loc.includes('Parauapebas/PA'), 'composição cidade/UF');
  assert(!loc.includes('Travessa B, 99'), 'composição não usa endereço live');
}

console.log('\n=== legado sem snapshot continua projeto → empresa ===');
{
  const liveAfterEdit = html({ project: BEIRA_B });
  assert(liveAfterEdit.includes(VENDOR_C.name), 'sem snapshot lê projeto atual');
  assert(liveAfterEdit.includes('30%'), 'sem snapshot lê 30/70');
}

console.log('\n=== Mundo Novo / Split / outros modelos ===');
{
  const snap = read('lib/lfImoveisContractSnapshot.ts');
  assert(!snap.includes('mundoNovo'), 'snapshot LF não importa Mundo Novo');
  assert(!snap.includes('seller_parties_json'), 'snapshot LF não lê seller_parties');
  assert(!snap.includes('revenueSplit') || snap.includes("'revenueSplit'"), 'sem lógica de Split');
  const gis = read('lib/gisSaleCreateService.ts');
  assert(gis.includes("=== 'ESTRELA_DO_SUL'"), 'não captura snapshot em outros modelos');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(!mundo.includes('lf_contract_snapshot'), 'Mundo Novo sellers intocado');
  const araguaia = read('lib/araguaiaContractContext.ts');
  assert(!araguaia.includes('lf_contract_snapshot'), 'Araguaia sem snapshot LF');
  const recanto = read('lib/recantoPrimaveraContractContext.ts');
  assert(!recanto.includes('lf_contract_snapshot'), 'Recanto sem snapshot LF');
  const meneses = read('lib/svLotes2ContractContext.ts');
  assert(!meneses.includes('lf_contract_snapshot'), 'Meneses/SV LOTES 2 sem snapshot LF');
}

console.log('\nOK mandatory-lf-imoveis-sale-snapshot-tests');
