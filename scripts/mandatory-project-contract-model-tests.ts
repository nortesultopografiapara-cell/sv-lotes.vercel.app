/**
 * Testes obrigatórios — modelo de contrato por empreendimento.
 * npx tsx scripts/mandatory-project-contract-model-tests.ts
 */
import {
  assertSaleContractModelConfigured,
  MISSING_PROJECT_CONTRACT_MODEL_MESSAGE,
  parseOptionalSaleContractModel,
  resolveSaleContractModelFromContext,
  applyEffectiveContractModelToTenant,
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
  SALE_CONTRACT_MODEL_OPTIONS.includes('MENESES') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('RECANTO_PRIMAVERA') &&
    SALE_CONTRACT_MODEL_OPTIONS.includes('MUNDO_NOVO'),
  'opções de UI incluem Meneses, Recanto e Mundo Novo',
);

console.log('\nOK mandatory-project-contract-model-tests');
