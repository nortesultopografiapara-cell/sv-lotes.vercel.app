/**
 * O C6 aparece na Integração Financeira para qualquer empresa, sem emissão real.
 * npx tsx scripts/mandatory-c6-financial-ui-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'components/finance/FinancialIntegrationPanel.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
const banks = fs.readFileSync(path.join(root, 'components/finance/BanksDevelopmentPanel.tsx'), 'utf8');
const asaas = fs.readFileSync(path.join(root, 'components/finance/AsaasIntegrationPanel.tsx'), 'utf8');
const inter = fs.readFileSync(path.join(root, 'components/finance/InterBankConfigPanel.tsx'), 'utf8');
const connection = fs.readFileSync(
  path.join(root, 'app/api/banking/c6/config/connection/route.ts'),
  'utf8',
);

assert(screen.includes('C6 Bank') && screen.includes('C6BankConfigPanel'), 'a aba C6 fica na Integração Financeira');
assert(screen.includes('ASAAS (Conta padrão)') && screen.includes('Bancos (Em desenvolvimento)'), 'Asaas e Inter permanecem na mesma tela');
assert(!screen.includes('f26f2331-1885-4ac6-8d0e-4131cc8a8014'), 'a tela não exige a empresa piloto');
assert(!panel.includes('bank_integrations'), 'a tela não exige uma linha C6 prévia');
assert(panel.includes('Emissão DESATIVADA') && panel.includes('Testar conexão'), 'emissão e teste de conexão ficam separados');
assert(panel.includes('type="password"') && !panel.includes('encrypted_payload'), 'o segredo não volta do banco');
assert(banks.includes('Configurar Banco Inter') && banks.includes('InterBankConfigPanel'), 'o Inter continua configurável');
assert(!banks.includes('C6BankConfigPanel'), 'o C6 não fica só na aba de desenvolvimento');
assert(!asaas.includes('c6') && !inter.includes('lib/banking/c6'), 'Asaas e Inter não passam a depender do C6');
assert(connection.includes('connection') && !connection.includes('requestC6AccessToken'), 'o teste não chama o banco sem autorização');
assert(connection.includes('authorizeTenantBilling'), 'o teste usa a empresa da sessão');
assert(panel.includes('Cadastrar conta C6'), 'a tela oferece o cadastro de uma conta C6');
assert(panel.includes('Contas do Asaas e do Banco Inter não entram nesta lista.'), 'Asaas e Inter não são oferecidos ao C6');
assert(panel.includes('A conexão OAuth não substitui esse vínculo.'), 'autenticação e vínculo ficam separados');
assert(panel.includes('financialAccountId'), 'a ativação continua exigindo a conta vinculada');
assert(panel.includes('!password.trim()'), 'a ativação não dispara com a senha vazia');
assert(panel.includes('não vem do Banco C6'), 'a recusa da senha não é apresentada como resposta do banco');
const emission = fs.readFileSync(path.join(root, 'app/api/banking/c6/emission/route.ts'), 'utf8');
const verifyAt = emission.indexOf('await verifyPrimaryAdminPassword');
const writeAt = emission.indexOf('await requestC6BolepixCompanyActivation');
assert(verifyAt > 0 && writeAt > verifyAt, 'a senha é conferida antes de gravar a solicitação');
assert(!emission.includes('setC6CompanyEmissionEnabled'), 'a solicitação não liga a flag de emissão');
assert(!emission.includes('postC6BolepixV2Charge'), 'a solicitação não emite boleto');
assert(emission.includes('postAllowed: panel.postAllowed'), 'o POST segue a decisão do servidor');
assert(emission.includes('emissionEnabled: false'), 'a solicitação não marca a emissão como ligada');
assert(emission.includes('Autorização não concedida.'), 'senha recusada continua genérica');

console.log('C6_FINANCIAL_UI_OK');
