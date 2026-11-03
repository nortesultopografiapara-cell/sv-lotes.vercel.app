/**
 * Testes obrigatórios — modelo de contrato por empreendimento.
 * npx tsx scripts/mandatory-project-contract-model-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSaleContractModelConfigured,
  MISSING_PROJECT_CONTRACT_MODEL_MESSAGE,
  parseOptionalSaleContractModel,
  resolveSaleContractModelFromContext,
  applyEffectiveContractModelToTenant,
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODEL_OPTIONS,
} from '../lib/contractModel';
import {
  buildProjectUpdatePayloads,
  PROJECT_UPDATE_KNOWN_COLUMNS,
} from '../lib/projects-update';
import {
  EMPTY_PROJECT_FORM,
  projectToFormInitialData,
} from '../lib/project-form';
import { buildCompanySettingsSavePayload } from '../lib/companySettingsFields';

const root = process.cwd();

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

assert(
  PROJECT_UPDATE_KNOWN_COLUMNS.includes('contract_model'),
  'projects-update conhece contract_model',
);

assert(
  EMPTY_PROJECT_FORM.contract_model === '',
  'form inicial herda empresa (vazio)',
);

{
  const form = projectToFormInitialData({
    name: 'Emp Daniel',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: 'MENESES',
  });
  assert(form.contract_model === 'MENESES', 'form carrega modelo do projeto');
}

{
  const payloads = buildProjectUpdatePayloads({
    name: 'A',
    city: 'B',
    uf: 'PA',
    contract_model: null,
  });
  assert(
    payloads[0].contract_model === null,
    'salvar "usar padrão da empresa" grava null',
  );
}

{
  const payloads = buildProjectUpdatePayloads({
    name: 'A',
    city: 'B',
    uf: 'PA',
    contract_model: 'RECANTO_PRIMAVERA',
  });
  assert(
    payloads[0].contract_model === 'RECANTO_PRIMAVERA',
    'salvar override do projeto',
  );
}

assert(parseOptionalSaleContractModel('') === null, 'vazio = herdar');
assert(parseOptionalSaleContractModel('MENESES') === 'MENESES', 'parse Meneses');

{
  const r = resolveSaleContractModelFromContext({
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
  });
  assert(r.model === 'MENESES' && r.source === 'project', 'prioridade projeto > empresa');
}

{
  const r = resolveSaleContractModelFromContext({
    saleModel: 'RECANTO_PRIMAVERA',
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
  });
  assert(
    r.model === 'RECANTO_PRIMAVERA' && r.source === 'sale',
    'snapshot da venda prevalece (histórico)',
  );
}

{
  const r = resolveSaleContractModelFromContext({
    contractModel: 'SV_LOTES_2',
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
  });
  assert(
    r.model === 'SV_LOTES_2' && r.source === 'contract',
    'snapshot do contrato prevalece sobre projeto',
  );
}

{
  const r = resolveSaleContractModelFromContext({
    companyModel: 'SV_LOTES_2',
  });
  assert(r.model === 'SV_LOTES_2' && r.source === 'company', 'fallback empresa');
}

{
  const a = resolveSaleContractModelFromContext({
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
  });
  const b = resolveSaleContractModelFromContext({
    projectModel: 'RECANTO_PRIMAVERA',
    companyModel: 'PADRAO',
  });
  assert(
    a.model === 'MENESES' && b.model === 'RECANTO_PRIMAVERA',
    'dois empreendimentos da mesma empresa → modelos distintos',
  );
}

{
  const tenant = applyEffectiveContractModelToTenant(
    { id: 't1', contract_model: 'PADRAO', name: 'X' },
    'MENESES',
  );
  assert(
    tenant.contract_model === 'MENESES',
    'tenant efetivo para generateContractHTML',
  );
}

try {
  assertSaleContractModelConfigured({
    companyFound: false,
    companyModel: null,
    projectModel: null,
  });
  throw new Error('deveria bloquear sem modelo');
} catch (e) {
  assert(
    e instanceof Error && e.message === MISSING_PROJECT_CONTRACT_MODEL_MESSAGE,
    'bloqueia sem modelo configurado',
  );
}

assert(
  SALE_CONTRACT_MODEL_OPTIONS.includes('PADRAO') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('SV_LOTES_2') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('MENESES') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('RECANTO_PRIMAVERA') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('ARAGUAIA') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('MUNDO_NOVO') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('ESTRELA_DO_SUL'),
  'opções de UI incluem todos os motores TypeScript oficiais',
);
assert(
  !SALE_CONTRACT_MODEL_OPTIONS.includes('CUSTOM'),
  'CUSTOM não entra no seletor operacional de empreendimento/empresa',
);

assert(
  SALE_CONTRACT_MODEL_LABELS.ESTRELA_DO_SUL === 'Estrela do Sul',
  'rótulo operacional: Estrela do Sul',
);

{
  const payloads = buildProjectUpdatePayloads({
    name: 'Estrela do Sul',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: 'ESTRELA_DO_SUL',
  });
  assert(
    payloads[0].contract_model === 'ESTRELA_DO_SUL',
    'salvar empreendimento grava ESTRELA_DO_SUL',
  );
}

{
  const form = projectToFormInitialData({
    name: 'Estrela do Sul',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: 'ESTRELA_DO_SUL',
  });
  assert(form.contract_model === 'ESTRELA_DO_SUL', 'reabrir empreendimento hidrata ESTRELA_DO_SUL');
}

{
  const saved = buildCompanySettingsSavePayload(
    { contract_model: 'ESTRELA_DO_SUL', fantasy_name: 'LF' },
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(saved.ok === true, 'save empresa aceita ESTRELA_DO_SUL');
  if (saved.ok) {
    assert(
      saved.payload.contract_model === 'ESTRELA_DO_SUL',
      'save empresa preserva ESTRELA_DO_SUL',
    );
  }
}

{
  const padrao = buildCompanySettingsSavePayload(
    { contract_model: 'PADRAO', fantasy_name: 'X' },
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(padrao.ok === true && padrao.ok && padrao.payload.contract_model === 'PADRAO', 'save empresa preserva PADRAO');
}

{
  const gis = readFileSync(join(root, 'components/projects/GisProjectFormModal.tsx'), 'utf8');
  assert(gis.includes('SALE_CONTRACT_MODEL_OPTIONS.map'), 'GIS usa o catálogo oficial no select');
  assert(gis.includes('SALE_CONTRACT_MODEL_LABELS[model]'), 'GIS mostra o rótulo do catálogo');
  assert(gis.includes('customContractModels'), 'GIS também lista CUSTOM publicados vinculados ao empreendimento');
  assert(!SALE_CONTRACT_MODEL_OPTIONS.includes('CUSTOM'), 'CUSTOM continua fora do catálogo de motores');
}

{
  const companyV2 = readFileSync(
    join(root, 'components/settings/CompanySettingsV2Shell.tsx'),
    'utf8',
  );
  const companyLegacy = readFileSync(
    join(root, 'components/settings/CompanySettingsFormLegacy.tsx'),
    'utf8',
  );
  assert(
    companyV2.includes('SALE_CONTRACT_MODEL_OPTIONS.map'),
    'Configurações da empresa (v2) listam o catálogo oficial',
  );
  assert(
    companyLegacy.includes('SALE_CONTRACT_MODEL_OPTIONS.map'),
    'Configurações da empresa (legado) listam o catálogo oficial',
  );
}

console.log('\nOK mandatory-project-contract-model-tests');
