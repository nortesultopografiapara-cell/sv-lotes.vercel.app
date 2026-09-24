/**
 * Capa, preâmbulo, anexo e assinaturas — ESTRELA_DO_SUL.
 */

import type { EstrelaDoSulContractContext } from '@/lib/estrelaDoSulContractContext';
import {
  ESTRELA_ANNEX_ROWS,
  ESTRELA_DO_SUL_CONTRACT_TITLE,
  ESTRELA_DO_SUL_COVER_TITLE,
  ESTRELA_DO_SUL_PROPERTY_TYPE,
} from '@/lib/estrelaDoSulContractConstants';
import { formatCpfCnpj } from '@/lib/inputMasks';
import { escEstrelaHtml, estrelaStrong } from '@/lib/estrelaDoSulContractFormat';

const SLOT_STYLE =
  'text-align: center; margin-bottom: 0; min-width: 0; width: 100%; page-break-inside: avoid; break-inside: avoid-page;';
const LINE_STYLE =
  'border-top: 1px solid #111; margin: 28px auto 0 auto; padding: 0; width: 72%; max-width: 260px; height: 12px; box-sizing: border-box;';
const ROLE_STYLE =
  'margin: 4px 0 6px 0; font-weight: bold; text-transform: uppercase; font-size: 11pt; text-align: center;';
const NAME_STYLE =
  'margin: 0 0 4px 0; font-weight: bold; font-size: 11pt; overflow-wrap: break-word; text-align: center;';
const META_STYLE =
  'margin: 0; font-size: 10pt; font-weight: normal; overflow-wrap: break-word; text-align: center;';

function cell(text: string): string {
  return `<td style="border:1px solid #111; padding:4px 6px;">${escEstrelaHtml(text) || '—'}</td>`;
}

function cellHtml(html: string): string {
  return `<td style="border:1px solid #111; padding:4px 6px;">${html || '—'}</td>`;
}

function th(text: string): string {
  return `<th style="border:1px solid #111; padding:4px 6px; text-align:left;">${escEstrelaHtml(text)}</th>`;
}

function buildSignatureSlot(params: {
  role: string;
  partyRole: 'VENDOR' | 'BUYER' | 'SPOUSE' | 'WITNESS';
  name?: string;
  docLines?: string[];
  extraClass?: string;
  /** Só o bloco do instrumento leva data-party-role (uma party e-sign por signatário). */
  electronic?: boolean;
}): string {
  const name = escEstrelaHtml(params.name || '');
  const docs = (params.docLines || [])
    .map((line) => escEstrelaHtml(line))
    .filter(Boolean)
    .map((line) => `<p style="${META_STYLE}">${line}</p>`)
    .join('\n');
  const className = params.electronic
    ? 'signature-slot'
    : ['estrela-sign-slot', params.extraClass || ''].filter(Boolean).join(' ');
  const roleAttr = params.electronic ? ` data-party-role="${params.partyRole}"` : '';
  return `
      <div class="${className}"${roleAttr} style="${SLOT_STYLE}">
        <div class="signature-line" style="${LINE_STYLE}"></div>
        <p style="${ROLE_STYLE}">${escEstrelaHtml(params.role)}</p>
        ${name ? `<p style="${NAME_STYLE}">${name}</p>` : ''}
        ${docs}
      </div>`;
}

export function buildEstrelaDoSulLogoHtml(ctx: EstrelaDoSulContractContext): string {
  if (!ctx.logoUrl) return '';
  return `<div class="estrela-logo" style="text-align:center; margin: 0 0 12px 0;"><img src="${escEstrelaHtml(ctx.logoUrl)}" alt="Logo" style="max-height:72px; max-width:220px;"/></div>`;
}

export function buildEstrelaDoSulCapaHtml(ctx: EstrelaDoSulContractContext): string {
  const lotLabel = [
    ctx.quadra ? `Quadra ${ctx.quadra}` : '',
    ctx.lote ? `lote ${ctx.lote}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const areaCell = [
    lotLabel ? `Chácara: ${lotLabel}` : 'Chácara',
    ctx.areaPhrase ? `Área Total: ${ctx.areaPhrase}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const vendorRows = `
      <tr>
        ${cell('VENDEDOR (A)')}
        ${cell(ctx.companyName)}
        ${cell('VENDEDOR (A)')}
        ${cell(ctx.companyCnpj)}
      </tr>
      ${
        ctx.hasSecondVendor
          ? `<tr>
        ${cell('VENDEDOR (A)')}
        ${cell(ctx.secondVendor.name)}
        ${cell('VENDEDOR (A)')}
        ${cell(formatCpfCnpj(ctx.secondVendor.cpf) || ctx.secondVendor.cpf)}
      </tr>`
          : ''
      }
      <tr>
        ${cell('COMPRADOR (A)')}
        ${cell(ctx.clienteNome)}
        ${cell('COMPRADOR (A)')}
        ${cell(ctx.clienteCpf)}
      </tr>
      ${
        ctx.hasConjuge
          ? `<tr>
        ${cell('COMPRADOR (A)')}
        ${cell(ctx.conjugeNome)}
        ${cell('COMPRADOR (A)')}
        ${cell(ctx.conjugeCpf)}
      </tr>`
          : `<tr>
        ${cell('COMPRADOR (A)')}
        ${cell('')}
        ${cell('COMPRADOR (A)')}
        ${cell('')}
      </tr>`
      }`;

  return `
    <div class="estrela-capa">
      ${buildEstrelaDoSulLogoHtml(ctx)}
      <h2 style="text-align:center; font-size:13pt; margin: 0 0 4px 0; text-transform:uppercase;">${escEstrelaHtml(ESTRELA_DO_SUL_COVER_TITLE)}</h2>
      <h3 style="text-align:center; font-size:12pt; margin: 0 0 16px 0; text-transform:uppercase;">CHACREAMENTO: ${escEstrelaHtml(ctx.enterpriseName)}</h3>

      <p style="font-weight:bold; margin: 0 0 6px 0;">1. DAS PARTES CONTRATANTES (QUALIFICAÇÃO)<sup>1</sup></p>
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:11pt; margin:0 0 14px 0;">
        <tr>
          ${th('Parte')}
          ${th('Nome/Razão Social')}
          ${th('Qualidade no Contrato')}
          ${th('Documento – CNPJ/CPF')}
        </tr>
        ${vendorRows}
      </table>
      <p style="font-size:9pt; margin: 0 0 14px 0;"><sup>1</sup> É responsabilidade do(a) COMPRADOR(A) informar ao VENDEDOR(A) sobre seu estado civil (casado ou união estável), para devido a inclusão do cônjuge/companheiro(a) neste contrato e na Escritura Pública, conforme exigência legal.</p>

      <p style="font-weight:bold; margin: 0 0 6px 0;">2. DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)</p>
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:11pt; margin:0 0 14px 0;">
        <tr>${th('Informação')}${th('Detalhamento')}</tr>
        <tr>${cell('Nome do Projeto')}${cell(ctx.enterpriseName)}</tr>
        <tr>${cell('Localização do Imóvel')}${cell(ctx.enterpriseLocation)}</tr>
        <tr>${cell('Área Vendida')}${cell(areaCell || '—')}</tr>
        <tr>${cell('Confrontações')}${cell(ctx.confrontacoesText || '—')}</tr>
        ${
          ctx.partnershipNote
            ? `<tr>${cell('Outras informações')}${cell(ctx.partnershipNote)}</tr>`
            : ''
        }
      </table>

      <p style="font-weight:bold; margin: 0 0 6px 0;">3. DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS</p>
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:11pt; margin:0 0 14px 0;">
        <tr>${th('ITEM')}${th('VALOR / DETALHAMENTO')}</tr>
        <tr>${cell('VALOR TOTAL DO IMÓVEL')}${cell(ctx.valorTotalExtenso ? `${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})` : ctx.valorTotalFmt)}</tr>
        <tr>${cell('VALOR DE CORRETAGEM')}${cell(ctx.valorCorretagemExtenso ? `${ctx.valorCorretagemFmt} (${ctx.valorCorretagemExtenso})` : ctx.valorCorretagemFmt)}</tr>
        <tr>${cellHtml('VALOR DO SINAL/ENTRADA (ARRAS)<sup>2</sup>')}${cell(ctx.valorSinalExtenso ? `${ctx.valorSinalFmt} (${ctx.valorSinalExtenso})` : ctx.valorSinalFmt)}</tr>
        <tr>${cellHtml('PARCELAS E VALORES<sup>3</sup>')}${cell(ctx.parcelasResumo)}</tr>
        <tr>${cell('VENCIMENTO DA 1ª PARCELA')}${cell(ctx.dataPrimeiraParcelaFmt)}</tr>
        <tr>${cell('ÍNDICE DE CORREÇÃO ANUAL')}${cell(ctx.indiceCorrecaoCapa)}</tr>
        <tr>${cell('MULTA MORATÓRIA POR ATRASO')}${cell('2% (dois por cento) sobre a parcela vencida')}</tr>
        <tr>${cell('JUROS DE MORA POR ATRASO')}${cell('1% (um por cento) ao mês')}</tr>
      </table>
      <p style="font-size:9pt; margin: 0 0 4px 0;"><sup>2</sup> Natureza jurídica: as ARRAS nos termos dos arts. 417 a 420 do Código Civil – É considerado um valor em dinheiro entregue pelas partes compradoras ao momento da assinatura de um contrato com objetivo de garantia de cumprimento do negócio e, em outras oportunidades, podendo ser aplicado como indenização pré-fixada.</p>
      <p style="font-size:9pt; margin: 0 0 4px 0;"><sup>3</sup> A comissão de corretagem possui natureza de remuneração pelos serviços de intermediação e não será restituída em caso de distrato, sendo este valor na importância de ${escEstrelaHtml(ctx.valorCorretagemFmt)}.</p>
      <p style="font-size:9pt; margin: 0 0 16px 0;"><sup>4</sup> Na hipótese de rescisão motivada pelo Comprador, o saldo a ser restituído sofrerá o desconto de: arras, retenção de até 25% do valor pago, corretagem, taxa de fruição, tributos, despesas operacionais, custos de revenda e eventuais multas contratuais.</p>

      <div class="estrela-capa-section-4">
        <p class="estrela-capa-section-4-title" style="font-weight:bold; margin: 0 0 6px 0;">4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS<sup>4</sup></p>
        ${buildEstrelaDoSulAnnexHtml(ctx)}
      </div>
      ${buildEstrelaDoSulSignaturesHtml(ctx, 'capa')}
    </div>`;
}

export function buildEstrelaDoSulPreambleHtml(ctx: EstrelaDoSulContractContext): string {
  const creci = ctx.companyCreci
    ? `, CRECI nº ${escEstrelaHtml(ctx.companyCreci)}`
    : '';
  const rgLine = ctx.clienteRg
    ? `portador(a) do RG sob nº ${escEstrelaHtml(ctx.clienteRg)}${
        ctx.clienteRgIssuer ? ` ${escEstrelaHtml(ctx.clienteRgIssuer)}` : ''
      } e do CPF sob nº ${escEstrelaHtml(ctx.clienteCpf)}`
    : `portador(a) do CPF sob nº ${escEstrelaHtml(ctx.clienteCpf)}`;
  const buyerBits = [
    estrelaStrong(ctx.clienteNome),
    ctx.clienteNacionalidade ? escEstrelaHtml(ctx.clienteNacionalidade) : 'brasileiro(a)',
    ctx.clienteEstadoCivil ? escEstrelaHtml(ctx.clienteEstadoCivil) : '',
    ctx.clienteProfissao ? escEstrelaHtml(ctx.clienteProfissao) : '',
    rgLine,
    ctx.clienteEndereco
      ? `residente e domiciliado(a) na ${escEstrelaHtml(ctx.clienteEndereco)}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  const sede = [
    ctx.companyAddress,
    ctx.companyCity && ctx.companyUf ? `${ctx.companyCity}/${ctx.companyUf}` : ctx.companyCity,
    ctx.companyCep ? `CEP: ${ctx.companyCep}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return `
    ${buildEstrelaDoSulLogoHtml(ctx)}
    <h2 style="text-align:center; font-size:16pt; margin: 0 0 4px 0; text-transform:uppercase;">${escEstrelaHtml(ESTRELA_DO_SUL_CONTRACT_TITLE)}</h2>
    <p style="text-align:right; font-style:italic; margin: 0 0 16px 0;">Instrumento particular de compra e venda de imóvel<br/>do tipo ${escEstrelaHtml(ESTRELA_DO_SUL_PROPERTY_TYPE.toLowerCase())} que se regerá pelas cláusulas e condições a seguir.</p>
    <p class="estrela-parties-lead" style="margin: 0 0 12px 0; text-align: justify;">
      Pelo presente instrumento particular de CONTRATO DE COMPRA E VENDA DE ${escEstrelaHtml(ESTRELA_DO_SUL_PROPERTY_TYPE)}, que se regerá pelas cláusulas e condições abaixo descritas, de um lado temos ${buyerBits}, doravante denominada <strong>COMPRADOR/CONTRATANTE</strong> e do outro temos a contratada ${estrelaStrong(ctx.companyName)}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${escEstrelaHtml(ctx.companyCnpj)}${creci}${
        sede ? `, com sede na ${escEstrelaHtml(sede)}` : ''
      }${
        ctx.companyEmail
          ? `, com o seguinte endereço eletrônico: ${escEstrelaHtml(ctx.companyEmail)}`
          : ''
      }, doravante designada simplesmente como <strong>VENDEDOR/CONTRATADA</strong>.
    </p>
    <p style="margin: 0 0 16px 0; text-align: justify;">
      As Partes, de livre e espontânea vontade, resolvem firmar o presente Instrumento Particular de Compra e Venda de Imóvel Rural, cujo objeto consiste na transação do loteamento de terra correspondente à chácara a seguir identificada.
    </p>`;
}

export function buildEstrelaDoSulAnnexHtml(_ctx: EstrelaDoSulContractContext): string {
  const rows = ESTRELA_ANNEX_ROWS.map(
    (row) => `<tr>${cell(row.item)}${cell(row.detail)}</tr>`,
  ).join('');
  return `
    <div class="estrela-capa-annex-table">
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:11pt; margin: 8px 0 16px 0;">
        <tr>${th('ITEM')}${th('Detalhamento')}</tr>
        ${rows}
      </table>
    </div>`;
}

export type EstrelaSignatureBlockKind = 'capa' | 'instrumento';

function buildEstrelaSignatureGrid(
  ctx: EstrelaDoSulContractContext,
  electronic: boolean,
): string {
  const buyerSlot = buildSignatureSlot({
    role: 'COMPRADOR(A)',
    partyRole: 'BUYER',
    name: ctx.clienteNome,
    docLines: [ctx.clienteCpf ? `CPF nº ${ctx.clienteCpf}` : ''].filter(Boolean),
    extraClass: 'signature-slot-buyer',
    electronic,
  });
  const companySlot = buildSignatureSlot({
    role: 'VENDEDOR(A)',
    partyRole: 'VENDOR',
    name: ctx.companyName,
    docLines: [ctx.companyCnpj ? `CNPJ ${ctx.companyCnpj}` : ''].filter(Boolean),
    extraClass: 'signature-slot-vendor-1',
    electronic,
  });
  const spouseSlot = ctx.hasConjuge
    ? buildSignatureSlot({
        role: 'CÔNJUGE ANUENTE',
        partyRole: 'SPOUSE',
        name: ctx.conjugeNome,
        docLines: [ctx.conjugeCpf ? `CPF nº ${ctx.conjugeCpf}` : ''].filter(Boolean),
        extraClass: 'signature-slot-spouse',
        electronic,
      })
    : '';
  const secondSlot = ctx.hasSecondVendor
    ? buildSignatureSlot({
        role: 'VENDEDOR(A)',
        partyRole: 'VENDOR',
        name: ctx.secondVendor.name,
        docLines: [
          ctx.secondVendor.cpf
            ? `CPF nº ${formatCpfCnpj(ctx.secondVendor.cpf) || ctx.secondVendor.cpf}`
            : '',
        ].filter(Boolean),
        extraClass: 'signature-slot-vendor-2',
        electronic,
      })
    : '';
  const witness1 = buildSignatureSlot({
    role: 'TESTEMUNHA 1',
    partyRole: 'WITNESS',
    extraClass: 'signature-slot-witness-1',
    docLines: ['CPF nº:'],
    electronic,
  });
  const witness2 = buildSignatureSlot({
    role: 'TESTEMUNHA 2',
    partyRole: 'WITNESS',
    extraClass: 'signature-slot-witness-2',
    docLines: ['CPF nº:'],
    electronic,
  });
  return `
        <div class="signature-grid signature-grid--estrela">
          ${buyerSlot}
          ${companySlot}
          ${spouseSlot}
          ${secondSlot}
          ${witness1}
          ${witness2}
        </div>`;
}

export function buildEstrelaDoSulSignaturesHtml(
  ctx: EstrelaDoSulContractContext,
  kind: EstrelaSignatureBlockKind = 'instrumento',
): string {
  const dateHtml = `
      <p class="contract-closing-date" style="margin: 0 0 18px 0; text-align: center; font-weight: bold;">
        ${escEstrelaHtml(ctx.closingCityDate)}
      </p>`;
  const grid = buildEstrelaSignatureGrid(ctx, kind === 'instrumento');

  if (kind === 'capa') {
    return `
    <div class="estrela-capa-signatures" data-estrela-sign-block="capa">
      ${dateHtml}
      <div class="contract-signatures contract-signatures--estrela-capa">
        ${grid}
      </div>
    </div>`;
  }

  return `
    <div class="contract-closing-and-signatures--estrela" data-estrela-sign-block="instrumento">
      <p class="estrela-closing-statement" style="margin: 0 0 14px 0; text-align: justify;">
        E por estarem assim justas e contratadas, as partes assinam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de 02 (duas) testemunhas instrumentárias abaixo identificadas.
      </p>
      ${dateHtml}
      <div class="contract-signatures contract-signatures--estrela">
        ${grid}
      </div>
    </div>`;
}
