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
  'text-align: center; margin-bottom: 0; min-width: 0; width: 100%; overflow: visible; page-break-inside: avoid; break-inside: avoid-page;';
const LINE_STYLE =
  'border-top: 1px solid #111; margin: 16px auto 0 auto; padding: 0; width: 72%; max-width: 260px; height: 8px; box-sizing: border-box;';
const ROLE_STYLE =
  'margin: 8px 0 4px 0; font-weight: bold; text-transform: uppercase; font-size: 10.5pt; text-align: center;';
const NAME_STYLE =
  'margin: 0 0 4px 0; font-weight: bold; font-size: 11pt; overflow-wrap: break-word; text-align: center;';
const META_STYLE =
  'margin: 0; font-size: 10pt; font-weight: normal; overflow-wrap: normal; word-break: keep-all; white-space: nowrap; overflow: visible; line-height: 1.35; padding-bottom: 2px; text-align: center;';

function cell(text: string): string {
  return `<td style="border:1px solid #111; padding:2px 4px;"><div class="estrela-td-keep">${escEstrelaHtml(text) || '—'}</div></td>`;
}

function th(text: string): string {
  return `<th style="border:1px solid #111; padding:2px 4px; text-align:left;"><div class="estrela-td-keep">${escEstrelaHtml(text)}</div></th>`;
}

function objectTableCols(): string {
  return `<colgroup><col class="estrela-col-info" style="width:33%;"/><col class="estrela-col-detail" style="width:67%;"/></colgroup>`;
}

function buildSignatureSlot(params: {
  role: string;
  partyRole: 'VENDOR' | 'BUYER' | 'SPOUSE' | 'WITNESS';
  name?: string;
  docLines?: string[];
  extraClass?: string;
}): string {
  const name = escEstrelaHtml(params.name || '');
  const docs = (params.docLines || [])
    .map((line) => escEstrelaHtml(line))
    .filter(Boolean)
    .map((line) => `<p class="estrela-sign-doc" style="${META_STYLE}">${line}</p>`)
    .join('\n');
  const className = ['signature-slot', 'estrela-sign-slot', params.extraClass || '']
    .filter(Boolean)
    .join(' ');
  return `
      <div class="${className}" data-party-role="${params.partyRole}" style="${SLOT_STYLE}">
        <div class="signature-line" style="${LINE_STYLE}"></div>
        <p style="${ROLE_STYLE}">${escEstrelaHtml(params.role)}</p>
        ${name ? `<p style="${NAME_STYLE}">${name}</p>` : ''}
        ${docs}
      </div>`;
}

/**
 * O Word original traz um único logotipo por página, no cabeçalho.
 * O chrome do PDF (`applyContractPdfChrome`) já aplica a identidade da empresa
 * em todas as páginas — repetir a marca no corpo da capa/instrumento duplica o logo.
 */
export function buildEstrelaDoSulLogoHtml(_ctx: EstrelaDoSulContractContext): string {
  return '';
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
      <h2 style="text-align:center; font-size:13pt; margin: 0 0 2px 0; text-transform:uppercase;">${escEstrelaHtml(ESTRELA_DO_SUL_COVER_TITLE)}</h2>
      <h3 style="text-align:center; font-size:12pt; margin: 0 0 6px 0; text-transform:uppercase;">CHACREAMENTO: ${escEstrelaHtml(ctx.enterpriseName)}</h3>

      <p class="estrela-section-title" style="font-weight:bold; margin: 0 0 4px 0;">1. DAS PARTES CONTRATANTES (QUALIFICAÇÃO)</p>
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:10.5pt; margin:0 0 6px 0;">
        <thead>
        <tr>
          ${th('Parte')}
          ${th('Nome/Razão Social')}
          ${th('Qualidade no Contrato')}
          ${th('Documento – CNPJ/CPF')}
        </tr>
        </thead>
        <tbody>
        ${vendorRows}
        </tbody>
      </table>
      <p class="estrela-footnote" style="font-size:9pt; margin: 0 0 6px 0;">É responsabilidade do(a) COMPRADOR(A) informar ao VENDEDOR(A) sobre seu estado civil (casado ou união estável), para devido a inclusão do cônjuge/companheiro(a) neste contrato e na Escritura Pública, conforme exigência legal.</p>

      <div class="estrela-lead-table estrela-capa-object">
      <p class="estrela-section-title" style="font-weight:bold; margin: 0 0 4px 0;">2. DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)</p>
      <table class="estrela-table estrela-object-table" style="width:100%; border-collapse:collapse; font-size:10.5pt; margin:0 0 6px 0;">
        ${objectTableCols()}
        <thead>
        <tr>${th('Informação')}${th('Detalhamento')}</tr>
        </thead>
        <tbody>
        <tr>${cell('Nome do Projeto')}${cell(ctx.enterpriseName)}</tr>
        <tr>${cell('Localização do Imóvel')}${cell(ctx.enterpriseLocation)}</tr>
        <tr>${cell('Área Vendida')}${cell(areaCell || '—')}</tr>
        <tr>${cell('MEDIDAS E CONFRONTAÇÕES')}${cell(ctx.confrontacoesText || '—')}</tr>
        ${
          ctx.partnershipNote
            ? `<tr>${cell('Outras informações')}${cell(ctx.partnershipNote)}</tr>`
            : ''
        }
        </tbody>
      </table>
      </div>

      <p class="estrela-section-title" style="font-weight:bold; margin: 0 0 4px 0;">3. DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS</p>
      <table class="estrela-table estrela-object-table" style="width:100%; border-collapse:collapse; font-size:10.5pt; margin:0 0 6px 0;">
        ${objectTableCols()}
        <thead>
        <tr>${th('ITEM')}${th('VALOR / DETALHAMENTO')}</tr>
        </thead>
        <tbody>
        <tr>${cell('VALOR TOTAL DO IMÓVEL')}${cell(ctx.valorTotalExtenso ? `${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})` : ctx.valorTotalFmt)}</tr>
        <tr>${cell('VALOR DE CORRETAGEM')}${cell(ctx.valorCorretagemExtenso ? `${ctx.valorCorretagemFmt} (${ctx.valorCorretagemExtenso})` : ctx.valorCorretagemFmt)}</tr>
        <tr>${cell('VALOR DO SINAL/ENTRADA (ARRAS)')}${cell(ctx.valorSinalExtenso ? `${ctx.valorSinalFmt} (${ctx.valorSinalExtenso})` : ctx.valorSinalFmt)}</tr>
        <tr>${cell('PARCELAS E VALORES')}${cell(ctx.parcelasResumo)}</tr>
        <tr>${cell('VENCIMENTO DA 1ª PARCELA')}${cell(ctx.dataPrimeiraParcelaFmt)}</tr>
        <tr>${cell('ÍNDICE DE CORREÇÃO ANUAL')}${cell(ctx.indiceCorrecaoCapa)}</tr>
        <tr>${cell('MULTA MORATÓRIA POR ATRASO')}${cell('2% (dois por cento) sobre a parcela vencida')}</tr>
        <tr>${cell('JUROS DE MORA POR ATRASO')}${cell('1% (um por cento) ao mês')}</tr>
        </tbody>
      </table>
      <p class="estrela-footnote" style="font-size:9pt; margin: 0 0 6px 0;">Na hipótese de rescisão motivada pelo Comprador, o saldo a ser restituído sofrerá o desconto de: arras, retenção de até 25% do valor pago, corretagem, taxa de fruição, tributos, despesas operacionais, custos de revenda e eventuais multas contratuais.</p>

      <div class="estrela-capa-section-4">
        <p class="estrela-capa-section-4-title" style="font-weight:bold; margin: 0 0 4px 0;">4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS</p>
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

  let spouseQualHtml = '';
  if (ctx.hasConjuge && ctx.conjugeNome) {
    const conjugeRgLine = ctx.conjugeRg
      ? `portador(a) do RG sob nº ${escEstrelaHtml(ctx.conjugeRg)}${
          ctx.conjugeRgIssuer ? ` ${escEstrelaHtml(ctx.conjugeRgIssuer)}` : ''
        }`
      : '';
    const spouseBits = [
      estrelaStrong(ctx.conjugeNome),
      ctx.conjugeNacionalidade ? escEstrelaHtml(ctx.conjugeNacionalidade) : '',
      ctx.conjugeEstadoCivil ? escEstrelaHtml(ctx.conjugeEstadoCivil) : '',
      ctx.conjugeProfissao ? escEstrelaHtml(ctx.conjugeProfissao) : '',
      conjugeRgLine,
      ctx.conjugeCpf ? `CPF sob nº ${escEstrelaHtml(ctx.conjugeCpf)}` : '',
      ctx.conjugeEndereco
        ? `residente e domiciliado(a) na ${escEstrelaHtml(ctx.conjugeEndereco)}`
        : '',
    ]
      .filter(Boolean)
      .join(', ');
    spouseQualHtml = `, neste ato com a anuência de seu cônjuge ${spouseBits}, na qualidade de <strong>CÔNJUGE ANUENTE</strong>`;
  }

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
    <p style="text-align:right; font-style:italic; margin: 0 0 10px 0;">Instrumento particular de compra e venda de imóvel<br/>do tipo ${escEstrelaHtml(ESTRELA_DO_SUL_PROPERTY_TYPE.toLowerCase())} que se regerá pelas cláusulas e condições a seguir.</p>
    <p class="estrela-parties-lead" style="margin: 0 0 8px 0; text-align: justify;">
      Pelo presente instrumento particular de CONTRATO DE COMPRA E VENDA DE ${escEstrelaHtml(ESTRELA_DO_SUL_PROPERTY_TYPE)}, que se regerá pelas cláusulas e condições abaixo descritas, de um lado temos ${buyerBits}${spouseQualHtml}, doravante denominada <strong>COMPRADOR/CONTRATANTE</strong> e do outro temos a contratada ${estrelaStrong(ctx.companyName)}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${escEstrelaHtml(ctx.companyCnpj)}${creci}${
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
      <table class="estrela-table" style="width:100%; border-collapse:collapse; font-size:10.5pt; margin: 4px 0 6px 0;">
        <thead>
        <tr>${th('ITEM')}${th('Detalhamento')}</tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
      </table>
    </div>`;
}

export type EstrelaSignatureBlockKind = 'capa' | 'instrumento';

function buildEstrelaSignatureGrid(ctx: EstrelaDoSulContractContext): string {
  const buyerSlot = buildSignatureSlot({
    role: 'COMPRADOR(A)',
    partyRole: 'BUYER',
    name: ctx.clienteNome,
    docLines: [ctx.clienteCpf ? `CPF nº ${ctx.clienteCpf}` : ''].filter(Boolean),
    extraClass: 'signature-slot-buyer',
  });
  const companySlot = buildSignatureSlot({
    role: 'VENDEDOR(A)',
    partyRole: 'VENDOR',
    name: ctx.companyName,
    docLines: [ctx.companyCnpj ? `CNPJ ${ctx.companyCnpj}` : ''].filter(Boolean),
    extraClass: 'signature-slot-vendor-1',
  });
  const spouseSlot = ctx.hasConjuge
    ? buildSignatureSlot({
        role: 'CÔNJUGE ANUENTE',
        partyRole: 'SPOUSE',
        name: ctx.conjugeNome,
        docLines: [ctx.conjugeCpf ? `CPF nº ${ctx.conjugeCpf}` : ''].filter(Boolean),
        extraClass: 'signature-slot-spouse',
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
      })
    : '';
  const witness1 = buildSignatureSlot({
    role: 'TESTEMUNHA 1',
    partyRole: 'WITNESS',
    extraClass: 'signature-slot-witness-1',
    docLines: ['CPF nº:'],
  });
  const witness2 = buildSignatureSlot({
    role: 'TESTEMUNHA 2',
    partyRole: 'WITNESS',
    extraClass: 'signature-slot-witness-2',
    docLines: ['CPF nº:'],
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
      <p class="contract-closing-date" style="margin: 0 0 14px 0; text-align: center; font-weight: bold;">
        ${escEstrelaHtml(ctx.closingCityDate)}
      </p>`;
  const grid = buildEstrelaSignatureGrid(ctx);

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
