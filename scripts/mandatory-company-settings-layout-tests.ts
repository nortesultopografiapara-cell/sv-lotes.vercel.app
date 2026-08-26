/**
 * Validação layout Configurações v2 — sem I/O, sem credenciais.
 * npx tsx scripts/mandatory-company-settings-layout-tests.ts
 */

import {
  TOPOGRAFIA_COMPANY_ID,
  IVANILDE_LEGACY_CPF,
  resolveCompanySettingsLayout,
} from '../lib/companySettingsLayout';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import { COMPANY_SETTINGS_V2_NAV_LABELS } from '../components/settings/CompanySettingsV2Shell';
import {
  buildCompanySettingsSavePayload,
  resolveLegalRepresentativeForSave,
  COMPANY_SETTINGS_COLUMNS,
} from '../lib/companySettingsFields';
import { isSaasContractPlaceholderValue } from '../lib/saasContractCompanyProfile';

const EXPECTED_NAV_LABELS = [
  'Geral',
  'Aparência',
  'Administradores',
  'Contratos',
  'Técnico',
  'Avançado',
  'Integração Financeira',
] as const;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testUnifiedNavLabels() {
  assert(
    COMPANY_SETTINGS_V2_NAV_LABELS.length === EXPECTED_NAV_LABELS.length,
    'menu lateral com 7 abas',
  );
  for (const label of EXPECTED_NAV_LABELS) {
    assert(COMPANY_SETTINGS_V2_NAV_LABELS.includes(label), `aba ${label} presente`);
  }
  console.log('OK testUnifiedNavLabels');
}

function testAllCompaniesUseV2Layout() {
  const companies = [
    { id: TOPOGRAFIA_COMPANY_ID, label: 'SV Topografia' },
    { id: MENESES_COMPANY_ID, label: 'Menezes' },
    { id: 'recanto-primavera-sample-id', label: 'Recanto Primavera' },
  ];

  for (const company of companies) {
    assert(
      resolveCompanySettingsLayout(company.id) === 'v2',
      `${company.label} usa layout v2`,
    );
    assert(
      resolveCompanySettingsLayout(company.id, {
        createdAt: '2020-01-01T00:00:00.000Z',
        settingsLayout: 'legacy',
      }) === 'v2',
      `${company.label} permanece v2 mesmo com settings_layout legacy`,
    );
  }

  assert(
    resolveCompanySettingsLayout('any-id', { documentRaw: IVANILDE_LEGACY_CPF }) === 'v2',
    'Ivanilde / Recanto PF usa layout v2',
  );

  console.log('OK testAllCompaniesUseV2Layout');
}

function testSettingsColumnsExcludeCompaniesCpf() {
  const cols = COMPANY_SETTINGS_COLUMNS.split(',').map((s) => s.trim());
  assert(!cols.includes('cpf'), 'SELECT não referencia companies.cpf inexistente');
  assert(cols.includes('contract_legal_rg_uf'), 'SELECT inclui UF do RG do representante');
  assert(cols.includes('legal_representative_address'), 'SELECT inclui residência pessoal');
  console.log('OK testSettingsColumnsExcludeCompaniesCpf');
}

function testTechnicalDoesNotReplaceLegalWithoutCheckbox() {
  const rep = resolveLegalRepresentativeForSave(
    {
      legal_representative: '',
      representative_cpf: '',
      use_technical_as_legal_rep: false,
    },
    {
      name: 'RT Nome',
      cpf: '12345678901',
      title: 'Eng.',
      email: 'rt@test.com',
      phone: '94999999999',
      crea: '',
      cau: '',
      cft: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(rep.legal_representative === null, 'RT não vira representante sem checkbox');
  assert(rep.use_technical_as_legal_rep === false, 'flag false');
  console.log('OK testTechnicalDoesNotReplaceLegalWithoutCheckbox');
}

function testTechnicalAsLegalWhenChecked() {
  const rep = resolveLegalRepresentativeForSave(
    { use_technical_as_legal_rep: true },
    {
      name: 'Severino',
      cpf: '11122233344',
      title: 'Técnico',
      email: 's@test.com',
      phone: '94911111111',
      crea: '',
      cau: '',
      cft: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(rep.legal_representative === 'Severino', 'checkbox copia nome RT');
  assert(rep.representative_cpf === '11122233344', 'checkbox copia CPF RT');
  console.log('OK testTechnicalAsLegalWhenChecked');
}

function testLegacySaveDoesNotSyncName() {
  const built = buildCompanySettingsSavePayload(
    { name: 'RAZÃO ORIGINAL', fantasy_name: 'Fantasia', address: 'Rua A' },
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
    { normalizeAddress: false, syncNameFromFantasy: false },
  );
  assert(built.ok, 'save legacy ok');
  assert(!('name' in built.payload), 'save legacy não envia campo name');
  assert(built.payload.contract_second_vendor_json === null, 'second vendor null quando vazio');
  console.log('OK testLegacySaveDoesNotSyncName');
}

function testV2SaveDoesNotSyncNameByDefault() {
  const built = buildCompanySettingsSavePayload(
    { name: 'RAZÃO ORIGINAL', fantasy_name: 'Fantasia', address: 'Rua 02, Quadra 123' },
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
    { normalizeAddress: true, syncNameFromFantasy: false },
  );
  assert(built.ok, 'save v2 ok');
  assert(!('name' in built.payload), 'save v2 não sobrescreve name sem flag');
  assert(!('cnpj' in built.payload), 'save não envia cnpj');
  assert('legal_representative_address' in built.payload, 'save inclui residência pessoal');
  assert('contract_legal_rg_uf' in built.payload, 'save inclui UF do RG');
  console.log('OK testV2SaveDoesNotSyncNameByDefault');
}

function testPlaceholderRejected() {
  const rep = resolveLegalRepresentativeForSave(
    { legal_representative: 'Representante legal', use_technical_as_legal_rep: false },
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
  assert(rep.legal_representative === null, 'placeholder vira null no save');
  assert(isSaasContractPlaceholderValue('Representante legal'), 'detector placeholder');
  console.log('OK testPlaceholderRejected');
}

function main() {
  testUnifiedNavLabels();
  testAllCompaniesUseV2Layout();
  testSettingsColumnsExcludeCompaniesCpf();
  testTechnicalDoesNotReplaceLegalWithoutCheckbox();
  testTechnicalAsLegalWhenChecked();
  testLegacySaveDoesNotSyncName();
  testV2SaveDoesNotSyncNameByDefault();
  testPlaceholderRejected();
  console.log('\nTodos os testes de layout Configurações v2 passaram.');
}

main();
