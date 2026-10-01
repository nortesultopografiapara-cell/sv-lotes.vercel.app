/**
 * HTML tokenizado ESTRELA_DO_SUL → CUSTOM.
 * Reconstrói o contrato oficial (generateEstrelaDoSulContract) com {{TOKENS}}.
 * Não altera o motor, vendas nem generated_html.
 */
import { emptyContractSecondVendorFields } from '@/lib/contractSecondVendor';
import { CONTRACT_PDF_CONTENT_WIDTH_PX } from '@/lib/contractPaginationEngine';
import type { EstrelaDoSulContractContext } from '@/lib/estrelaDoSulContractContext';
import {
  ESTRELA_DO_SUL_CONTRACT_TITLE,
  ESTRELA_DO_SUL_COVER_TITLE,
} from '@/lib/estrelaDoSulContractConstants';
import {
  buildEstrelaDoSulCapaHtml,
  buildEstrelaDoSulInfraPageHtml,
  buildEstrelaDoSulPreambleHtml,
  buildEstrelaDoSulSignaturesHtml,
} from '@/lib/estrelaDoSulContractParties';
import { buildEstrelaDoSulClausesHtml } from '@/lib/estrelaDoSulContractClauses';
import { customPlaceholderToken } from '@/lib/customContractPlaceholders';

function tok(key: string): string {
  return customPlaceholderToken(key);
}

const PAGE_BREAK =
  '<div data-sv-page-break="true" class="sv-page-break"></div>';

export const ESTRELA_OFFICIAL_CUSTOM_MARKERS = [
  ESTRELA_DO_SUL_COVER_TITLE,
  '1. DAS PARTES CONTRATANTES (QUALIFICAÇÃO)',
  '2. DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)',
  '3. DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS',
  '4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS',
  'CLÁUSULA PRIMEIRA',
  'DO OBJETO, DA CAPA RESUMO E DOS ANEXOS',
  'CLÁUSULA SEGUNDA',
  'PAGAMENTO, REAJUSTE E MORA',
  'CLÁUSULA TERCEIRA',
  'CLÁUSULA QUARTA',
  'CLÁUSULA QUINTA',
  'CLÁUSULA SEXTA',
  'CLÁUSULA SÉTIMA',
  'CLÁUSULA OITAVA',
  'CLÁUSULA NONA',
  'CLÁUSULA DÉCIMA',
  'CLÁUSULA DÉCIMA PRIMEIRA',
  'CLÁUSULA DÉCIMA SEGUNDA',
  ESTRELA_DO_SUL_CONTRACT_TITLE,
  'ITEM',
  'VALOR / DETALHAMENTO',
] as const;

export function buildEstrelaDoSulTokenContext(): EstrelaDoSulContractContext {
  const secondVendor = {
    ...emptyContractSecondVendorFields(),
    name: tok('SELLER_2_NAME'),
    cpf: tok('SELLER_2_CPF_CNPJ'),
    rg: tok('SELLER_2_RG'),
    address: tok('SELLER_2_ADDRESS'),
    phone: tok('SELLER_2_PHONE'),
    email: '',
  };
  return {
    logoUrl: '',
    companyName: tok('COMPANY_LEGAL_NAME'),
    companyCnpj: tok('COMPANY_CNPJ'),
    companyAddress: tok('COMPANY_ADDRESS'),
    companyEmail: tok('COMPANY_EMAIL'),
    companyPhone: tok('COMPANY_PHONE'),
    companyCity: tok('COMPANY_CITY'),
    companyUf: tok('COMPANY_STATE'),
    companyCep: tok('COMPANY_ZIP'),
    companyCreci: tok('COMPANY_CRECI'),
    legalRepName: tok('SELLER_1_NAME'),
    legalRepCpf: tok('SELLER_1_CPF_CNPJ'),
    hasSecondVendor: true,
    secondVendor,
    firstVendorPercent: 0,
    secondVendorPercent: 0,
    clienteNome: tok('CLIENT_NAME'),
    clienteCpf: tok('CLIENT_CPF'),
    clienteRg: tok('CLIENT_RG'),
    clienteRgIssuer: tok('CLIENT_RG_ISSUER'),
    clienteNacionalidade: tok('CLIENT_NATIONALITY'),
    clienteEstadoCivil: tok('CLIENT_CIVIL_STATE'),
    clienteProfissao: tok('CLIENT_PROFESSION'),
    clienteEndereco: tok('CLIENT_ADDRESS'),
    clienteEmail: tok('CLIENT_EMAIL'),
    clienteTelefone: tok('CLIENT_PHONE'),
    hasConjuge: true,
    conjugeNome: tok('SPOUSE_NAME'),
    conjugeCpf: tok('SPOUSE_CPF'),
    conjugeRg: tok('SPOUSE_RG'),
    conjugeRgIssuer: tok('SPOUSE_RG_ISSUER'),
    conjugeNacionalidade: tok('SPOUSE_NATIONALITY'),
    conjugeEstadoCivil: tok('SPOUSE_CIVIL_STATE'),
    conjugeProfissao: tok('SPOUSE_PROFESSION'),
    conjugeEndereco: tok('SPOUSE_ADDRESS'),
    brokerNome: tok('BROKER_NAME'),
    brokerDocumento: tok('BROKER_CPF'),
    brokerCreci: tok('BROKER_CRECI'),
    hasBroker: true,
    enterpriseName: tok('PROJECT_NAME'),
    enterpriseLocation: tok('PROJECT_LOCATION'),
    municipality: tok('PROJECT_CITY'),
    uf: tok('PROJECT_STATE'),
    forumCity: tok('PROJECT_FORUM_CITY'),
    quadra: tok('BLOCK_NAME'),
    lote: tok('LOT_NUMBER'),
    areaM2: tok('LOT_AREA'),
    areaPhrase: tok('LOT_AREA'),
    frontPhrase: tok('LOT_FRONT'),
    backPhrase: tok('LOT_BACK'),
    rightPhrase: tok('LOT_RIGHT'),
    leftPhrase: tok('LOT_LEFT'),
    confrontacoesText: tok('LOT_BOUNDARIES'),
    partnershipNote: tok('PARTNERSHIP_NOTE'),
    valorTotal: 0,
    valorTotalFmt: tok('SALE_VALUE'),
    valorTotalExtenso: tok('SALE_VALUE_EXTENSO'),
    valorCorretagem: 0,
    valorCorretagemFmt: tok('BROKER_COMMISSION'),
    valorCorretagemExtenso: tok('BROKER_COMMISSION_EXTENSO'),
    valorSinal: 0,
    valorSinalFmt: tok('DOWN_PAYMENT'),
    valorSinalExtenso: tok('DOWN_PAYMENT_EXTENSO'),
    valorSaldo: 0,
    valorSaldoFmt: tok('SALE_BALANCE'),
    qtdParcelas: 1,
    valorParcela: 0,
    valorParcelaFmt: tok('INSTALLMENT_VALUE'),
    parcelasResumo: tok('INSTALLMENTS_SUMMARY'),
    dataPrimeiraParcelaFmt: tok('FIRST_DUE_DATE'),
    indiceCorrecaoCapa: tok('CORRECTION_INDEX'),
    isCashPayment: false,
    dataContratoFmt: tok('CONTRACT_DATE'),
    dataContratoExtensoFmt: tok('CONTRACT_DATE'),
    dataContratoCidadeUf: `${tok('PROJECT_CITY')}/${tok('PROJECT_STATE')}`,
    closingCityDate: tok('CONTRACT_CITY_DATE'),
  };
}

function injectWitnessTokens(html: string): string {
  return html
    .replace(
      /(<div class="[^"]*signature-slot-witness-1[^"]*"[\s\S]*?<p[^>]*>TESTEMUNHA 1<\/p>)/g,
      `$1\n        <p>{{WITNESS_1_NAME}}</p>`,
    )
    .replace(
      /(<div class="[^"]*signature-slot-witness-1[\s\S]*?)CPF nº:/g,
      `$1CPF nº {{WITNESS_1_CPF}}`,
    )
    .replace(
      /(<div class="[^"]*signature-slot-witness-2[^"]*"[\s\S]*?<p[^>]*>TESTEMUNHA 2<\/p>)/g,
      `$1\n        <p>{{WITNESS_2_NAME}}</p>`,
    )
    .replace(
      /(<div class="[^"]*signature-slot-witness-2[\s\S]*?)CPF nº:/g,
      `$1CPF nº {{WITNESS_2_CPF}}`,
    );
}

export function buildEstrelaDoSulTokenizedCustomHtml(): string {
  const ctx = buildEstrelaDoSulTokenContext();
  const html = `
    <div class="sv-contract-document sv-contract-estrela-do-sul sv-contract-custom-from-engine" data-contract-model="CUSTOM" data-converted-from="ESTRELA_DO_SUL" style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.35; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px; box-sizing: border-box; text-align: justify;">
      ${buildEstrelaDoSulCapaHtml(ctx)}
      ${PAGE_BREAK}
      ${buildEstrelaDoSulInfraPageHtml(ctx)}
      ${PAGE_BREAK}
      <div class="estrela-instrument">
        ${buildEstrelaDoSulPreambleHtml(ctx)}
        ${buildEstrelaDoSulClausesHtml(ctx)}
        ${buildEstrelaDoSulSignaturesHtml(ctx, 'instrumento')}
      </div>
    </div>
  `.trim();
  return injectWitnessTokens(html);
}
