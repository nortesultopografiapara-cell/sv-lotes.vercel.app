/**
 * Testes obrigatórios — converter cópia de motor TS em CUSTOM editável.
 * npx tsx scripts/mandatory-engine-model-to-custom-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  cloneStore,
  duplicateModel,
  historyForModel,
  snapshotGisFields,
  type OperationalStore,
} from '../lib/contractModelCentralOps';
import {
  CONVERT_SYSTEM_SEED_BLOCKED,
  CONVERT_TO_CUSTOM_CONFIRM,
  CONVERT_TO_CUSTOM_LABEL,
  CONVERT_TO_CUSTOM_UNSUPPORTED,
  canConvertEngineModelToCustom,
  conversionNoteFromVersion,
  convertEngineModelToCustom,
  engineToCustomHistoryNote,
  renderEngineModelAsCustomHtml,
} from '../lib/engineModelToCustom';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import { fillCustomPlaceholdersForPreview } from '../lib/customContractHtml';
import { formatCpfCnpj } from '../lib/inputMasks';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sampleEstrelaStore(): OperationalStore {
  return {
    models: [
      {
        id: 'm-estrela',
        companyId: 'co-a',
        catalogCode: 'ESTRELA_DO_SUL',
        engineKey: 'estrela_do_sul',
        name: 'LF ESTRELA DO SUL',
        status: 'active',
        source: 'system_seed',
        isCompanyDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm-mundo',
        companyId: 'co-a',
        catalogCode: 'MUNDO_NOVO',
        engineKey: 'mundo_novo',
        name: 'Mundo Novo',
        status: 'active',
        source: 'user',
        isCompanyDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    versions: [
      {
        id: 'v-estrela',
        modelId: 'm-estrela',
        companyId: 'co-a',
        version: 1,
        status: 'published',
        contentHtml: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'v-mundo',
        modelId: 'm-mundo',
        companyId: 'co-a',
        version: 1,
        status: 'published',
        contentHtml: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    links: [],
    companiesContractModel: { 'co-a': 'ESTRELA_DO_SUL' },
    projectsContractModel: { 'proj-1': 'ESTRELA_DO_SUL' },
    generatedHtmlByContractId: { 'ct-estrela': '<p>contrato estrela original</p>' },
  };
}

assert(
  CONVERT_TO_CUSTOM_LABEL === 'Converter para editável',
  'rótulo do botão homologado',
);
assert(
  CONVERT_TO_CUSTOM_CONFIRM.includes('Converter este modelo para editável?') &&
    CONVERT_TO_CUSTOM_CONFIRM.includes('modelo CUSTOM') &&
    CONVERT_TO_CUSTOM_CONFIRM.includes('O modelo original e o motor do sistema não serão modificados.') &&
    CONVERT_TO_CUSTOM_CONFIRM.includes('Esta ação afetará somente este modelo.'),
  'texto de confirmação homologado',
);

assert(
  !canConvertEngineModelToCustom({
    source: 'system_seed',
    catalogCode: 'ESTRELA_DO_SUL',
    status: 'active',
  }),
  'seed do sistema não converte',
);
assert(
  canConvertEngineModelToCustom({
    source: 'user',
    catalogCode: 'ESTRELA_DO_SUL',
    status: 'active',
  }),
  'cópia user ESTRELA pode converter',
);
assert(
  !canConvertEngineModelToCustom({
    source: 'user',
    catalogCode: 'MUNDO_NOVO',
    status: 'active',
  }),
  'MUNDO_NOVO ainda não tem conversor seguro',
);
assert(
  !canConvertEngineModelToCustom({
    source: 'user',
    catalogCode: 'CUSTOM',
    status: 'active',
  }),
  'CUSTOM já editável não reconverte',
);

{
  const html = renderEngineModelAsCustomHtml('ESTRELA_DO_SUL');
  const tokens = [
    'CLIENT_NAME',
    'CLIENT_CPF',
    'COMPANY_LEGAL_NAME',
    'SELLER_2_NAME',
    'SELLER_2_CPF_CNPJ',
    'SPOUSE_NAME',
    'PROJECT_NAME',
    'PROJECT_LOCATION',
    'LOT_NUMBER',
    'LOT_AREA',
    'LOT_BOUNDARIES',
    'SALE_VALUE',
    'DOWN_PAYMENT',
    'INSTALLMENTS_SUMMARY',
    'FIRST_DUE_DATE',
    'CORRECTION_INDEX',
    'PARTNERSHIP_NOTE',
    'SALE_BALANCE',
    'CONTRACT_CITY_DATE',
  ];
  for (const key of tokens) {
    assert(html.includes(`{{${key}}}`), `HTML tokenizado contém {{${key}}}`);
  }
  assert(!html.includes('JOÃO DA SILVA'), 'não congela nome de comprador');
  assert(!html.includes('Será repassado ao primeiro vendedor'), 'nota de parceria permanece token');
  assert(
    !html.includes('40%') && !html.includes('60%') && !html.includes('70%'),
    'percentuais de participação não entram congelados no HTML',
  );
  assert(html.includes('data-converted-from="ESTRELA_DO_SUL"'), 'marca origem da conversão');
  assert(html.includes('estrela-capa'), 'preserva capa');
  assert(html.includes('CLÁUSULA PRIMEIRA'), 'preserva cláusulas');
  assert(/<table/i.test(html), 'preserva tabelas');
}

assert(
  formatCpfCnpj('{{SELLER_2_CPF_CNPJ}}') === '{{SELLER_2_CPF_CNPJ}}',
  'máscara de CPF não destrói token',
);

{
  const store = sampleEstrelaStore();
  const before = snapshotGisFields(store);
  const original = cloneStore(store);
  let seedBlocked = false;
  try {
    convertEngineModelToCustom(store, 'm-estrela', 'co-a', { userId: 'user-1' });
  } catch (e) {
    seedBlocked = e instanceof Error && e.message === CONVERT_SYSTEM_SEED_BLOCKED;
  }
  assert(seedBlocked, 'seed ESTRELA bloqueado');
  assert(
    store.models.find((m) => m.id === 'm-estrela')?.catalogCode === 'ESTRELA_DO_SUL',
    'seed permanece ESTRELA_DO_SUL',
  );

  const { copy } = duplicateModel(store, 'm-estrela', 'co-a');
  assert(copy.source === 'user' && copy.catalogCode === 'ESTRELA_DO_SUL', 'cópia herda motor');
  const converted = convertEngineModelToCustom(store, copy.id, 'co-a', {
    userId: 'user-1',
    at: '2026-10-01T21:00:00.000Z',
  });
  assert(converted.model.catalogCode === 'CUSTOM', 'cópia vira CUSTOM');
  assert(converted.model.engineKey === 'custom', 'engine_key custom');
  assert(
    store.models.find((m) => m.id === 'm-estrela')?.catalogCode === 'ESTRELA_DO_SUL',
    'original não muda após converter a cópia',
  );
  const history = historyForModel(store, copy.id, 'co-a');
  assert(
    history.some((v) => v.version === 0 && v.status === 'draft' && String(v.contentHtml || '').includes('{{CLIENT_NAME}}')),
    'rascunho v0 com HTML tokenizado',
  );
  assert(
    history.some((v) => v.version === 1 && v.status === 'published' && v.contentHtml == null),
    'v1 anterior permanece como backup do motor',
  );
  const publishedCustom = history.find((v) => v.version === 2 && v.status === 'published');
  assert(publishedCustom, 'publica snapshot CUSTOM da conversão');
  const note = conversionNoteFromVersion(publishedCustom || null);
  assert(
    note === engineToCustomHistoryNote('ESTRELA_DO_SUL') &&
      note === 'Modelo convertido de ESTRELA_DO_SUL para CUSTOM',
    'histórico registra a conversão',
  );
  const meta = (publishedCustom?.engineParamsJson as { convertedFrom?: Record<string, unknown> } | null)
    ?.convertedFrom;
  assert(meta?.modelId === copy.id, 'auditoria guarda model_id');
  assert(meta?.convertedBy === 'user-1', 'auditoria guarda usuário');
  assert(meta?.fromCatalogCode === 'ESTRELA_DO_SUL', 'auditoria guarda motor anterior');
  assert(meta?.previousPublishedVersion === 1, 'auditoria guarda versão anterior');
  assert(
    JSON.stringify(snapshotGisFields(store)) === JSON.stringify(before),
    'conversão não altera GIS nem generated_html',
  );
  assert(
    original.generatedHtmlByContractId['ct-estrela'] ===
      store.generatedHtmlByContractId['ct-estrela'],
    'snapshot de contrato emitido permanece',
  );

  let mundoBlocked = false;
  try {
    convertEngineModelToCustom(store, 'm-mundo', 'co-a');
  } catch (e) {
    mundoBlocked = e instanceof Error && e.message === CONVERT_TO_CUSTOM_UNSUPPORTED;
  }
  assert(mundoBlocked, 'cópia de motor sem conversor permanece bloqueada');
}

{
  const html = renderEngineModelAsCustomHtml('ESTRELA_DO_SUL');
  const values = resolveCustomPreviewValues({
    tenantId: 'co-a',
    company: {
      razao_social: 'L.F. IMÓVEIS LTDA',
      cnpj: '00.000.000/0001-00',
      city: 'Marabá',
      state: 'PA',
    },
    customer: { name: 'Maria Compradora', cpf_cnpj: '12345678901' },
    sale: {
      company_id: 'co-a',
      contract_model: 'ESTRELA_DO_SUL',
      total_value: 38500,
      down_payment: 5000,
      payment_type: 'parcelado',
      installments_count: 10,
      lf_contract_snapshot_json: {
        participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
        secondVendor: { name: 'Sócio Estrela', cpf: '52998224725' },
      },
    },
    project: {
      name: 'Estrela do Sul',
      city: 'Marabá',
      uf: 'PA',
      address: 'PA-150',
      lf_contract_config_json: {
        participation: { firstVendorPercent: 50, secondVendorPercent: 50 },
        secondVendor: { name: 'Sócio Projeto', cpf: '11144477735' },
      },
    },
    lot: { quadra: 'A', lote: '10' },
    receipts: [
      { installment_number: 1, amount: 3350, due_date: '2026-04-10' },
    ],
  });
  assert(values.CLIENT_NAME === 'Maria Compradora', 'token comprador resolve da venda');
  assert(values.LF_FIRST_VENDOR_PERCENT === '40%', 'percentual 1 vem do snapshot da venda');
  assert(values.LF_SECOND_VENDOR_PERCENT === '60%', 'percentual 2 vem do snapshot da venda');
  assert(
    String(values.PARTNERSHIP_NOTE || '').includes('40%') &&
      String(values.PARTNERSHIP_NOTE || '').includes('60%') &&
      !String(values.PARTNERSHIP_NOTE || '').includes('50%'),
    'nota de parceria usa percentuais da venda, não congela 50/50 do projeto',
  );
  const preview = fillCustomPlaceholdersForPreview(html, values);
  assert(preview.includes('Maria Compradora'), 'prévia resolve {{CLIENT_NAME}}');
  assert(preview.includes('40%'), 'prévia resolve percentual dinâmico');
  assert(!preview.includes('{{CLIENT_NAME}}'), 'token de comprador preenchido');
}

{
  const projectOnly = resolveCustomPreviewValues({
    tenantId: 'co-a',
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    sale: { company_id: 'co-a', contract_model: 'ESTRELA_DO_SUL', total_value: 10000 },
    project: {
      name: 'Estrela do Sul',
      lf_contract_config_json: {
        participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
        secondVendor: { name: 'Sócio Projeto', cpf: '11144477735' },
      },
    },
  });
  assert(projectOnly.LF_FIRST_VENDOR_PERCENT === '40%', 'sem snapshot, percentual vem do empreendimento');
  assert(projectOnly.LF_SECOND_VENDOR_PERCENT === '60%', 'segundo percentual do empreendimento');
}

const central = read('components/contracts/central/ContractModelsOperationalCentral.tsx');
assert(central.includes('CONVERT_TO_CUSTOM_LABEL'), 'Central tem botão Converter para editável');
assert(central.includes("type: 'convert'"), 'Central abre confirmação de conversão');
assert(central.includes('Cancelar'), 'confirmação tem Cancelar');
assert(central.includes('handleConvertToCustom'), 'Central persiste a conversão');
assert(central.includes('ensure_company_contract_model_draft'), 'após converter garante draft CUSTOM');
assert(central.includes("'Editar contrato'"), 'CUSTOM abre Editar contrato');
assert(central.includes('conversionNoteFromVersion'), 'histórico mostra nota de conversão');
assert(!central.includes('generateContractHTML'), 'Central não chama o motor GIS');
assert(!central.includes('gisSaleCreateService'), 'Central não cria venda');

const motor = read('lib/estrelaDoSulContractTemplate.ts');
assert(motor.includes('export function generateEstrelaDoSulContract'), 'motor ESTRELA permanece');
assert(
  !read('lib/engineModelToCustom.ts').includes('generateEstrelaDoSulContract('),
  'conversão não executa o motor de venda',
);

console.log('OK — converter motor ESTRELA_DO_SUL → CUSTOM');
