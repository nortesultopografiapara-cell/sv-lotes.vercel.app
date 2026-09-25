/**
 * LF Imóveis — configuração contratual por empreendimento.
 * npx tsx scripts/mandatory-lf-imoveis-project-config-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildEstrelaDoSulEsignVendorPartyInputs } from '../lib/estrelaDoSulContractEsign';
import {
  isLfParticipationValid,
  lfConfigToFormState,
  lfContractConfigPersistedEquals,
  normalizeLfContractConfigForSave,
  parseLfContractConfigJson,
  resolveLfContractConfig,
} from '../lib/lfImoveisContractConfig';
import {
  buildProjectUpdatePayloads,
  LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE,
  PROJECT_UPDATE_KNOWN_COLUMNS,
  updateProjectWithFallback,
} from '../lib/projects-update';
import { EMPTY_PROJECT_FORM, projectToFormInitialData } from '../lib/project-form';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
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

const SALE = {
  payment_type: 'Parcelado',
  installments_count: 4,
  total_value: 20000,
  down_payment: 2000,
  sale_date: '2026-02-20',
};

const BLOCK = {
  quadra: '01',
  lot: '01',
  area: 1000,
  frente: 20,
  fundo: 20,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
};

const ESTRELA_PROJECT = {
  name: 'Chacreamento Estrela do Sul',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ESTRELA_DO_SUL',
};

const BEIRA_PROJECT = {
  name: 'Chacreamento Beira Rio',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ESTRELA_DO_SUL',
  lf_contract_config_json: {
    secondVendor: VENDOR_B,
    participation: {
      firstVendorPercent: 25,
      secondVendorPercent: 75,
    },
  },
};

function html(project: Record<string, unknown>, tenant: Record<string, unknown> = COMPANY) {
  return generateContractHTML({
    tenant,
    customer: { name: 'Comprador', cpf: '52998224725', document: '52998224725' },
    project,
    block: BLOCK,
    sale: SALE,
  });
}

const root = path.join(__dirname, '..');
function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

type MockStore = Record<string, unknown>;

function createMockProjectsClient(opts: {
  store: MockStore;
  rejectKeys?: string[];
  missingColumn?: string;
  postgresMissing?: string;
  omitLfUnlessDedicated?: boolean;
  calls?: Record<string, unknown>[];
}) {
  const calls = opts.calls || [];
  return {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              calls.push({ ...payload });
              if (
                opts.missingColumn &&
                Object.prototype.hasOwnProperty.call(payload, opts.missingColumn)
              ) {
                return {
                  data: null,
                  error: {
                    message: `Could not find the '${opts.missingColumn}' column of 'projects' in the schema cache`,
                  },
                };
              }
              if (
                opts.postgresMissing &&
                Object.prototype.hasOwnProperty.call(payload, opts.postgresMissing)
              ) {
                return {
                  data: null,
                  error: {
                    message: `column projects.${opts.postgresMissing} does not exist`,
                  },
                };
              }
              if (opts.rejectKeys?.some((key) => key in payload)) {
                return {
                  data: null,
                  error: { message: `reject ${opts.rejectKeys.join(',')}` },
                };
              }
              const keys = Object.keys(payload);
              const dedicatedLf =
                keys.length === 1 && keys[0] === 'lf_contract_config_json';
              if (opts.omitLfUnlessDedicated && !dedicatedLf) {
                const { lf_contract_config_json: _dropped, ...rest } = payload;
                Object.assign(opts.store, rest);
              } else {
                Object.assign(opts.store, payload);
              }
              return { data: { ...opts.store }, error: null };
            },
          }),
        }),
      }),
    }),
  };
}

async function roundTrip(params: {
  form: {
    secondVendor?: Record<string, unknown>;
    firstVendorPercent?: string;
    secondVendorPercent?: string;
  };
  store?: MockStore;
  rejectKeys?: string[];
  omitLfUnlessDedicated?: boolean;
}) {
  const normalized = normalizeLfContractConfigForSave({
    secondVendor: params.form.secondVendor || {},
    firstVendorPercent: params.form.firstVendorPercent ?? '',
    secondVendorPercent: params.form.secondVendorPercent ?? '',
  });
  assert(normalized.ok, 'normalize ok no round-trip');
  if (!normalized.ok) throw new Error('normalize falhou');
  const store = params.store || {
    id: 'beira',
    name: 'Chacreamento Beira Rio',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  const client = createMockProjectsClient({
    store,
    rejectKeys: params.rejectKeys,
    omitLfUnlessDedicated: params.omitLfUnlessDedicated,
  });
  const result = await updateProjectWithFallback(client as never, 'beira', {
    name: String(store.name),
    city: String(store.city),
    uf: String(store.uf),
    location: 'Parauapebas - PA',
    forum_city: 'Parauapebas',
    lf_contract_config_json: normalized.value,
  });
  assert(!result.error, `update sem erro (${result.error?.message || ''})`);
  assert(result.data, 'update devolveu row');
  const readJson = result.data?.lf_contract_config_json ?? store.lf_contract_config_json;
  assert(
    lfContractConfigPersistedEquals(readJson, normalized.value),
    'read bate com o JSON pedido',
  );
  const hydrated = projectToFormInitialData({
    ...store,
    lf_contract_config_json: readJson,
  });
  return { normalized, store, readJson, hydrated, formState: lfConfigToFormState(readJson) };
}

console.log('\n=== migration aditiva ===');
{
  const sql = read('supabase/migrations/20261026120000_projects_lf_contract_config_json.sql');
  const executable = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert(executable.includes('ADD COLUMN IF NOT EXISTS lf_contract_config_json'), 'ADD COLUMN nullable');
  assert(!/\bUPDATE\b/i.test(executable), 'sem UPDATE/backfill');
  assert(!/\bDELETE\b/i.test(executable) && !/\bTRUNCATE\b/i.test(executable), 'sem DELETE/TRUNCATE');
  assert(!/antonio/i.test(sql), 'não grava Antônio');
  assert(!executable.includes('seller_parties_json'), 'não altera seller_parties_json');
  assert(!executable.includes('contract_second_vendor_json'), 'não altera JSON da empresa');
}

console.log('\n=== persistência de projeto ===');
assert(
  PROJECT_UPDATE_KNOWN_COLUMNS.includes('lf_contract_config_json'),
  'projects-update conhece a coluna LF',
);
assert(
  PROJECT_UPDATE_KNOWN_COLUMNS.includes('seller_parties_json'),
  'seller_parties_json permanece conhecido',
);
{
  const payloads = buildProjectUpdatePayloads({
    name: 'Beira Rio',
    city: 'Parauapebas',
    uf: 'PA',
    location: 'Parauapebas - PA',
    forum_city: 'Parauapebas',
    lf_contract_config_json: {
      secondVendor: VENDOR_B,
      participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
    },
  });
  assert(payloads[0].lf_contract_config_json != null, 'update envia JSON LF');
  assert(
    payloads.every((p) => p.lf_contract_config_json != null),
    'nenhum payload de fallback descarta lf_contract_config_json',
  );
}
{
  const payloads = buildProjectUpdatePayloads({
    name: 'Estrela',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  });
  assert(payloads[0].lf_contract_config_json === null, 'null limpa config (fallback empresa)');
  assert(
    payloads.every((p) => p.lf_contract_config_json === null),
    'null LF permanece em todos os fallbacks',
  );
}

console.log('\n=== validação percentuais ===');
assert(isLfParticipationValid(40, 60), '40/60 válido');
assert(isLfParticipationValid(25, 75), '25/75 válido');
assert(isLfParticipationValid(0, 100), '0/100 válido');
assert(!isLfParticipationValid(40, 50), 'não soma 100');
assert(!isLfParticipationValid(-1, 101), 'negativo inválido');
{
  const bad = normalizeLfContractConfigForSave({
    firstVendorPercent: '40',
    secondVendorPercent: '50',
  });
  assert(!bad.ok, 'save rejeita soma != 100');
}
{
  const empty = normalizeLfContractConfigForSave({
    secondVendor: {},
    firstVendorPercent: '',
    secondVendorPercent: '',
  });
  assert(empty.ok && empty.value === null, 'vazio persiste null');
}
{
  const own = normalizeLfContractConfigForSave({
    secondVendor: VENDOR_B,
    firstVendorPercent: '25',
    secondVendorPercent: '75',
  });
  assert(own.ok && own.value && (own.value as { secondVendor: { name: string } }).secondVendor.name === VENDOR_B.name, 'save vendedor B');
  assert(
    (own.value as { participation: { firstVendorPercent: number } }).participation.firstVendorPercent === 25,
    'save 25/75',
  );
  assert(!('wallet' in (own.value as object)), 'não persiste wallet');
}

void (async () => {
console.log('\n=== round-trip form → payload → parse → update → read → hydrate ===');
{
  const rt = await roundTrip({
    form: {
      secondVendor: VENDOR_B,
      firstVendorPercent: '25',
      secondVendorPercent: '75',
    },
    rejectKeys: ['forum_city', 'location', 'neighborhood', 'address'],
  });
  assert(rt.hydrated.lf_contract_config.secondVendor.name === VENDOR_B.name, 'hydrate vendedor B completo');
  assert(rt.hydrated.lf_contract_config.firstVendorPercent === '25', 'hydrate 25');
  assert(rt.hydrated.lf_contract_config.secondVendorPercent === '75', 'hydrate 75');
}
{
  const rt = await roundTrip({
    form: {
      secondVendor: VENDOR_B,
      firstVendorPercent: '40',
      secondVendorPercent: '60',
    },
  });
  assert(rt.formState.firstVendorPercent === '40', '40/60 salvo não é campo vazio');
  assert(rt.formState.secondVendorPercent === '60', '60 salvo aparece no form');
}
{
  const rt = await roundTrip({
    form: { secondVendor: {}, firstVendorPercent: '', secondVendorPercent: '' },
  });
  assert(rt.normalized.value === null, 'JSON null/fallback');
  assert(rt.formState.firstVendorPercent === '', 'null não hidrata 40');
  assert(rt.formState.secondVendorPercent === '', 'null não hidrata 60');
  const resolved = resolveLfContractConfig({
    project: { ...ESTRELA_PROJECT, lf_contract_config_json: rt.readJson },
    company: COMPANY,
  });
  assert(resolved.usingPercentFallback, 'null usa fallback 40/60 na resolução');
  assert(resolved.firstVendorPercent === 40 && resolved.secondVendorPercent === 60, 'resolução fallback 40/60');
}
{
  const store: MockStore = {
    id: 'beira',
    name: 'Chacreamento Beira Rio',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  await roundTrip({
    form: {
      secondVendor: VENDOR_B,
      firstVendorPercent: '25',
      secondVendorPercent: '75',
    },
    store,
  });
  const edited = await roundTrip({
    form: {
      secondVendor: { ...VENDOR_B, name: 'Bruno Beira Editado' },
      firstVendorPercent: '40',
      secondVendorPercent: '60',
    },
    store,
  });
  assert(edited.hydrated.lf_contract_config.secondVendor.name === 'Bruno Beira Editado', 'edição posterior hidrata nome');
  assert(edited.hydrated.lf_contract_config.firstVendorPercent === '40', 'edição posterior hidrata 40/60 salvo');
}
{
  const beiraStore: MockStore = {
    id: 'beira',
    name: 'Chacreamento Beira Rio',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  const estrelaStore: MockStore = {
    id: 'estrela',
    name: 'Chacreamento Estrela do Sul',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  await roundTrip({
    form: {
      secondVendor: VENDOR_B,
      firstVendorPercent: '25',
      secondVendorPercent: '75',
    },
    store: beiraStore,
  });
  const estrelaResolved = resolveLfContractConfig({
    project: { ...ESTRELA_PROJECT, lf_contract_config_json: estrelaStore.lf_contract_config_json },
    company: COMPANY,
  });
  assert(estrelaStore.lf_contract_config_json == null, 'Estrela permanece null após save Beira');
  assert(estrelaResolved.secondVendor.name === 'Antonio Ferreira Silva', 'isolamento Estrela × Beira no store');
  assert(
    (beiraStore.lf_contract_config_json as { secondVendor: { name: string } }).secondVendor.name ===
      VENDOR_B.name,
    'Beira guardou vendedor B',
  );
}
{
  const store: MockStore = {
    id: 'beira',
    name: 'Chacreamento Beira Rio',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  const rt = await roundTrip({
    form: {
      secondVendor: VENDOR_B,
      firstVendorPercent: '25',
      secondVendorPercent: '75',
    },
    store,
    omitLfUnlessDedicated: true,
  });
  assert(rt.hydrated.lf_contract_config.firstVendorPercent === '25', 'write dedicado recupera JSON omitido no fallback');
}
{
  const store: MockStore = {
    id: 'beira',
    name: 'Beira',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  const client = createMockProjectsClient({
    store,
    missingColumn: 'lf_contract_config_json',
  });
  const result = await updateProjectWithFallback(client as never, 'beira', {
    name: 'Beira',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: {
      secondVendor: VENDOR_B,
      participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
    },
  });
  assert(Boolean(result.error), 'coluna ausente não mascara sucesso');
  assert(result.error?.code === LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE, 'código coluna ausente');
  assert(store.lf_contract_config_json == null, 'store intacto quando a coluna falta');
}
{
  const store: MockStore = {
    id: 'beira',
    name: 'Beira',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: null,
  };
  const client = createMockProjectsClient({
    store,
    postgresMissing: 'location',
  });
  const result = await updateProjectWithFallback(client as never, 'beira', {
    name: 'Beira',
    city: 'Parauapebas',
    uf: 'PA',
    lf_contract_config_json: {
      secondVendor: VENDOR_B,
      participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
    },
  });
  assert(!result.error, 'location inexistente não impede o save LF');
  assert(
    lfContractConfigPersistedEquals(store.lf_contract_config_json, {
      secondVendor: VENDOR_B,
      participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
    }),
    'JSON LF persiste mesmo quando location não existe',
  );
}

console.log('\n=== Estrela sem config própria = fallback empresa 40/60 ===');
{
  const resolved = resolveLfContractConfig({
    project: ESTRELA_PROJECT,
    company: COMPANY,
  });
  assert(resolved.secondVendor.name === 'Antonio Ferreira Silva', 'Estrela → Antônio');
  assert(resolved.secondVendorSource === 'company', 'fonte empresa');
  assert(resolved.firstVendorPercent === 40 && resolved.secondVendorPercent === 60, '40/60');
  assert(resolved.usingCompanySecondVendorFallback, 'usa fallback da empresa');
  const estrelaHtml = html(ESTRELA_PROJECT);
  assert(estrelaHtml.includes('Antonio Ferreira Silva'), 'contrato Estrela tem Antônio');
  assert(estrelaHtml.includes('40%') && estrelaHtml.includes('60%'), 'contrato Estrela 40/60');
  assert(!estrelaHtml.includes('Bruno Beira Ficticio'), 'Estrela não vaza vendedor B');
}

console.log('\n=== Beira Rio com config própria ===');
{
  const resolved = resolveLfContractConfig({
    project: BEIRA_PROJECT,
    company: COMPANY,
  });
  assert(resolved.secondVendor.name === 'Bruno Beira Ficticio', 'Beira → vendedor B');
  assert(resolved.secondVendorSource === 'project', 'fonte projeto');
  assert(resolved.firstVendorPercent === 25 && resolved.secondVendorPercent === 75, '25/75');
  assert(!resolved.usingCompanySecondVendorFallback, 'não usa Antônio da empresa');
  const beiraHtml = html(BEIRA_PROJECT);
  assert(beiraHtml.includes('Bruno Beira Ficticio'), 'contrato Beira tem vendedor B');
  assert(beiraHtml.includes('25%') && beiraHtml.includes('75%'), 'contrato Beira 25/75');
  assert(!beiraHtml.includes('Antonio Ferreira Silva'), 'Beira não usa Antônio');
  assert(!beiraHtml.includes('40%'), 'Beira não interpola 40%');
}

console.log('\n=== isolamento: editar Beira não muda Estrela ===');
{
  const beiraCopy = {
    ...BEIRA_PROJECT,
    lf_contract_config_json: {
      secondVendor: { ...VENDOR_B },
      participation: { firstVendorPercent: 25, secondVendorPercent: 75 },
    },
  };
  const estrelaBefore = resolveLfContractConfig({
    project: ESTRELA_PROJECT,
    company: COMPANY,
  });
  (beiraCopy.lf_contract_config_json.secondVendor as { name: string }).name =
    'Nome Alterado So No Beira';
  (beiraCopy.lf_contract_config_json.participation as { firstVendorPercent: number }).firstVendorPercent = 10;
  const estrelaAfter = resolveLfContractConfig({
    project: ESTRELA_PROJECT,
    company: COMPANY,
  });
  const beiraAfter = resolveLfContractConfig({
    project: beiraCopy,
    company: COMPANY,
  });
  assert(
    estrelaAfter.secondVendor.name === estrelaBefore.secondVendor.name,
    'Estrela permanece Antônio após editar Beira',
  );
  assert(estrelaAfter.firstVendorPercent === 40, 'Estrela permanece 40%');
  assert(beiraAfter.secondVendor.name === 'Nome Alterado So No Beira', 'Beira reflete a edição');
  assert(html(ESTRELA_PROJECT).includes('Antonio Ferreira Silva'), 'HTML Estrela intacto');
  assert(html(ESTRELA_PROJECT).includes('40%'), 'HTML Estrela 40% intacto');
}

console.log('\n=== incompleto no projeto cai na empresa ===');
{
  const resolved = resolveLfContractConfig({
    project: {
      ...ESTRELA_PROJECT,
      lf_contract_config_json: { secondVendor: { name: 'Incompleto' } },
    },
    company: COMPANY,
  });
  assert(resolved.secondVendor.name === 'Antonio Ferreira Silva', 'incompleto → empresa');
  assert(resolved.secondVendorSource === 'company', 'fonte empresa após incompleto');
}

console.log('\n=== percentuais inválidos → fallback 40/60 ===');
{
  const resolved = resolveLfContractConfig({
    project: {
      ...BEIRA_PROJECT,
      lf_contract_config_json: {
        secondVendor: VENDOR_B,
        participation: { firstVendorPercent: 10, secondVendorPercent: 10 },
      },
    },
    company: COMPANY,
  });
  assert(resolved.secondVendor.name === 'Bruno Beira Ficticio', 'vendedor B permanece');
  assert(resolved.firstVendorPercent === 40 && resolved.secondVendorPercent === 60, 'percentuais inválidos → 40/60');
}

console.log('\n=== e-sign usa o mesmo vendedor resolvido ===');
{
  const estrelaVendors = buildEstrelaDoSulEsignVendorPartyInputs({
    company: COMPANY,
    project: ESTRELA_PROJECT,
  });
  assert(estrelaVendors.length === 2, 'Estrela e-sign 2 VENDOR');
  assert(estrelaVendors[1].name === 'Antonio Ferreira Silva', 'Estrela VENDOR 2 = Antônio');

  const beiraVendors = buildEstrelaDoSulEsignVendorPartyInputs({
    company: COMPANY,
    project: BEIRA_PROJECT,
  });
  assert(beiraVendors.length === 2, 'Beira e-sign 2 VENDOR');
  assert(beiraVendors[1].name === 'Bruno Beira Ficticio', 'Beira VENDOR 2 = vendedor B');
  assert(beiraVendors[1].name !== estrelaVendors[1].name, 'e-sign não compartilha vendedor');
}

console.log('\n=== form / Mundo Novo intocado ===');
assert(Array.isArray(EMPTY_PROJECT_FORM.seller_party_contacts), 'form Mundo Novo intacto');
assert(EMPTY_PROJECT_FORM.lf_contract_config.secondVendor.name === '', 'form LF vazio');
{
  const form = projectToFormInitialData(BEIRA_PROJECT);
  assert(form.lf_contract_config.secondVendor.name === VENDOR_B.name, 'form carrega vendedor B');
  assert(form.lf_contract_config.firstVendorPercent === '25', 'form carrega 25');
}
{
  const parsed = parseLfContractConfigJson(BEIRA_PROJECT.lf_contract_config_json);
  assert(parsed.secondVendor.name === VENDOR_B.name, 'parse secondVendor');
  assert(parsed.participation?.secondVendorPercent === 75, 'parse participation');
}

console.log('\n=== isolamento de arquivos Mundo Novo ===');
{
  const resolver = read('lib/lfImoveisContractConfig.ts');
  assert(!resolver.includes('mundoNovo'), 'resolver LF não importa Mundo Novo');
  assert(!resolver.includes('seller_parties_json'), 'resolver LF não lê seller_parties_json');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(!mundo.includes('lf_contract_config'), 'Mundo Novo sellers intocado');
}

console.log('\nOK mandatory-lf-imoveis-project-config-tests');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
