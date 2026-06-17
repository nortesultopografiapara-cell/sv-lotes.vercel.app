/**
 * Template jurídico isolado — Recanto Primavera (Ivanilde).
 */

import {
  buildRecantoVendorFieldLine,
  sanitizeContractField,
} from '@/lib/recantoPrimaveraCompanyProfile';
import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

export const RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 =
  'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA';

/** Marcador estável para testes — distingue do modelo Meneses/PADRAO. */
export const RECANTO_PRIMAVERA_LEGAL_MARKER =
  'Pelo presente instrumento particular de compromisso de compra e venda';

/** @deprecated use RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 */
export const RECANTO_PRIMAVERA_CONTRACT_TITLE = RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1;

function buildRecantoClauseQuartaHtml(ctx: RecantoPrimaveraContractContext): string {
  const taxes =
    ' Taxas decorrentes do presente contrato e da escritura definitiva de compra e venda, respectivo registro, bem como todos os impostos e taxas incidentes sobre o imóvel a partir da assinatura do presente instrumento, são de inteira responsabilidade do(a) COMPRADOR(A).';

  const bankLine = ctx.bankPaymentText
    ? ` Os pagamentos deverão ser realizados mediante depósito ou transferência bancária na conta indicada pelo(a) VENDEDOR(A): ${ctx.bankPaymentText}.`
    : '';

  if (ctx.isCashPayment) {
    return `<p style="margin-bottom: 0;">
      <strong>Cláusula Quarta — Do Pagamento:</strong> O pagamento do valor total de <strong>${ctx.valorTotalFmt}${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}</strong> será realizado à vista pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A), na data da assinatura do presente contrato, dando este, após a confirmação do pagamento, plena, geral e irrevogável quitação.${bankLine}${taxes}
    </p>`;
  }

  const entradaExtenso = ctx.valorEntradaExtenso || 'zero reais';
  const saldoExtenso = ctx.valorSaldoExtenso || '';

  return `<p style="margin-bottom: 0;">
      <strong>Cláusula Quarta — Do Pagamento:</strong> Fica a cargo do(a) COMPRADOR(A) o pagamento do valor total de <strong>${ctx.valorTotalFmt}${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}</strong>, sendo entrada de <strong>${ctx.valorEntradaFmt} (${entradaExtenso})</strong> e saldo de <strong>${ctx.valorSaldoFmt}${saldoExtenso ? ` (${saldoExtenso})` : ''}</strong>, parcelado em <strong>${ctx.qtdParcelas} parcelas iguais de ${ctx.valorParcelaFmt}${ctx.valorParcelaExtenso ? ` (${ctx.valorParcelaExtenso})` : ''}</strong>, com vencimento da primeira parcela em <strong>${ctx.dataPrimeiraParcelaFmt || 'data a combinar'}</strong> e da última em <strong>${ctx.dataUltimaParcelaFmt || 'data a combinar'}</strong>.${bankLine}${taxes}
    </p>`;
}

export function buildRecantoPrimaveraTitleHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const line2 = sanitizeContractField(ctx.titleLine2);
  return `
    <div class="contract-header-recanto" style="text-align: center; margin-bottom: 18px;">
      ${ctx.empresaLogoHtml}
      <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 17px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0; padding: 0; line-height: 1.3;">${RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1}</h2>
      ${line2 ? `<h3 style="font-family: 'Times New Roman', Times, serif; font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 14px 0; padding: 0; line-height: 1.3;">${line2}</h3>` : ''}
    </div>`;
}

export function buildRecantoPrimaveraVendorHeaderHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const p = ctx.profile;
  const rgLine =
    p.rg && p.rgIssuer
      ? `${p.rg} — ${p.rgIssuer}`
      : p.rg || p.rgIssuer;

  const lines = [
    buildRecantoVendorFieldLine('VENDEDOR(A)', p.vendorName),
    buildRecantoVendorFieldLine('Nacionalidade', p.nationality),
    buildRecantoVendorFieldLine('Estado civil', p.maritalStatus),
    buildRecantoVendorFieldLine('Profissão', p.profession),
    buildRecantoVendorFieldLine('RG', rgLine),
    buildRecantoVendorFieldLine(p.documentLabel, p.documentFmt),
    buildRecantoVendorFieldLine('Telefone', p.phone),
    buildRecantoVendorFieldLine('E-mail', p.email),
    buildRecantoVendorFieldLine('Endereço', p.address),
  ].filter(Boolean);

  return `
    <div class="contract-clause contract-vendor-block" style="margin-bottom: 14px;">
      ${lines.join('\n')}
    </div>`;
}

function buildBuyerQualificationText(ctx: RecantoPrimaveraContractContext): string {
  const parts: string[] = [`<strong>${ctx.clienteNome}</strong>`];

  if (ctx.clienteNacionalidade) parts.push(ctx.clienteNacionalidade);
  if (ctx.clienteEstadoCivil) parts.push(`estado civil ${ctx.clienteEstadoCivil}`);
  if (ctx.clienteProfissao) parts.push(`profissão ${ctx.clienteProfissao}`);
  if (ctx.clienteRg) {
    const rgText = ctx.clienteRgIssuer
      ? `RG nº ${ctx.clienteRg}, ${ctx.clienteRgIssuer}`
      : `RG nº ${ctx.clienteRg}`;
    parts.push(rgText);
  }
  if (ctx.clienteCpfCnpj) parts.push(`CPF nº ${ctx.clienteCpfCnpj}`);
  if (ctx.clienteTelefone) parts.push(`telefone ${ctx.clienteTelefone}`);
  if (ctx.clienteEmail) parts.push(`e-mail ${ctx.clienteEmail}`);

  let text = parts.join(', ');
  text += ctx.clienteIdentitySuffix;
  text += ctx.clienteConjugeSuffix;

  const addressParts: string[] = [];
  if (ctx.clienteEndereco) addressParts.push(ctx.clienteEndereco);
  if (ctx.clienteBairro) addressParts.push(`Bairro ${ctx.clienteBairro}`);
  if (ctx.clienteCep) addressParts.push(`CEP ${ctx.clienteCep}`);
  if (ctx.clienteCidade && ctx.clienteUf) {
    addressParts.push(`Cidade de ${ctx.clienteCidade} - ${ctx.clienteUf}`);
  }

  if (addressParts.length > 0) {
    text += `, residente e domiciliado(a) na ${addressParts.join(', ')}`;
  }

  return `${text}.`;
}

export function buildRecantoPrimaveraBuyerClauseHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  return `
    <div class="contract-clause" style="margin-bottom: 14px;">
      <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase;">COMPRADOR(A):</p>
      <p style="margin: 0;">${buildBuyerQualificationText(ctx)}</p>
    </div>`;
}

export function buildRecantoPrimaveraLegalBodyHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const areaText = ctx.lotArea || '';
  const clauseQuartaHtml = buildRecantoClauseQuartaHtml(ctx);

  return `
    <div class="contract-preamble">
      <p style="margin-bottom: 0;">
        ${RECANTO_PRIMAVERA_LEGAL_MARKER}, as partes acima qualificadas têm entre si justo e acertado o presente compromisso de compra e venda, que se regerá pelas cláusulas e condições a seguir, mutuamente aceitas e outorgadas, obrigando-se as partes, seus herdeiros e sucessores, na forma da lei:
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Primeira — Do Objeto:</strong> O(A) VENDEDOR(A) declara-se legítimo(a) possuidor(a), livre e desembaraçado(a) de quaisquer ônus, do imóvel identificado como <strong>LOTE ${ctx.lote} DA QUADRA ${ctx.quadra}</strong>${ctx.enterpriseDescString}${ctx.enterpriseLocationSuffix}${areaText ? `, com área total de <strong>${areaText}</strong>` : ''}, ${ctx.lotBoundariesClause}${ctx.curvaClause}
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Segunda — Da Promessa:</strong> Pelo presente instrumento, o(a) VENDEDOR(A) promete vender ao(à) COMPRADOR(A), que promete comprar, o imóvel descrito na cláusula primeira, pelo preço e condições estabelecidos nas cláusulas seguintes.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>Cláusula Terceira — Do Preço:</strong> O valor total do presente compromisso é de <strong>${ctx.valorTotalFmt}${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}</strong>, negociado de forma <strong>${ctx.tipoVenda.toUpperCase()}</strong>.
      </p>
      <p style="margin-bottom: 0;">
        <strong>Parágrafo Único:</strong> A posse do imóvel fica limitada ao(à) COMPRADOR(A) a partir da assinatura do presente instrumento e do cumprimento das condições aqui previstas.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      ${clauseQuartaHtml}
    </div>

    ${ctx.brokerClauseHtml ? `<div class="contract-clause" style="padding-bottom: 5px;">${ctx.brokerClauseHtml}</div>` : ''}

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Quinta — Da Desistência:</strong> Em caso de desistência pelo(a) COMPRADOR(A), será restituído somente 40% (quarenta por cento) do valor efetivamente pago, salvo acordo escrito em contrário. A tolerância quanto ao inadimplemento não implica novação das obrigações.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Sexta — Da Irretratabilidade:</strong> Fica estabelecida a irretratabilidade e irrevogabilidade do presente contrato, podendo o(a) COMPRADOR(A) ou seus sucessores requerer adjudicação compulsória, nos termos da legislação vigente.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>Cláusula Sétima — Da Escritura:</strong> A escritura definitiva de compra e venda será outorgada pelo(a) VENDEDOR(A) ao(à) COMPRADOR(A) no prazo de 6 (seis) meses contados da expedição do decreto de aprovação do loteamento.
      </p>
      <p style="margin-bottom: 0;">
        <strong>Parágrafo Único:</strong> O prazo será automaticamente prorrogado se a Prefeitura Municipal não aprovar o loteamento até a data prevista, ou por motivo de força maior.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Oitava — Das Obrigações:</strong> O presente contrato obriga as partes, seus herdeiros e sucessores, que deverão cumprir todos os termos e condições deste instrumento.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Nona — Da Multa:</strong> A parte que descumprir qualquer cláusula deste instrumento pagará multa de 2% (dois por cento) sobre o valor total do contrato, atualizado por índice oficial, sem prejuízo das demais penalidades previstas.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Décima — Dos Honorários:</strong> Em caso de litígio, a parte vencida arcará com custas processuais e honorários advocatícios de 20% (vinte por cento) em favor da parte vencedora.
      </p>
    </div>

    ${ctx.electronicSignatureClauseHtml}

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>Cláusula Décima Terceira — Do Foro:</strong> Fica eleito o foro ${ctx.foroText} para a solução de qualquer questão oriunda do presente contrato, renunciando as partes a qualquer outro, por mais especial que seja.
      </p>
    </div>`;
}

export function buildRecantoPrimaveraSignaturesHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const p = ctx.profile;
  const docLabel = p.documentLabel;
  const locationLine = [ctx.dataContratoCidade, ctx.dataContratoUf]
    .filter((v) => sanitizeContractField(v))
    .join(' - ');

  const footerContact = [
    p.phone ? `Tel.: ${p.phone}` : '',
    p.email ? `E-mail: ${p.email}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return `
    <div class="contract-clause">
      <p style="margin-bottom: 20px;">
        E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
      </p>
      <div style="text-align: right; margin-bottom: 30px;">
        <p style="margin: 0;">${locationLine ? `${locationLine}, ` : ''}${ctx.dataContratoFmt}</p>
      </div>
    </div>

    <div class="contract-signatures">
      <div class="signature-slot">
        ${ctx.empresaAssinatura}
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${p.vendorName}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">VENDEDOR(A)${p.documentFmt ? `<br/>${docLabel}: ${p.documentFmt}` : ''}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${ctx.clienteNome}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">COMPRADOR(A)${ctx.clienteCpfCnpj ? `<br/>CPF: ${ctx.clienteCpfCnpj}` : ''}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 8px auto; width: 60%;"></div>
        <p style="margin: 0 0 8px 0; font-weight: bold;">TESTEMUNHA 1</p>
        <p style="margin: 0 0 5px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0; font-size: 10pt;">CPF: ___________________________________________</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 8px auto; width: 60%;"></div>
        <p style="margin: 0 0 8px 0; font-weight: bold;">TESTEMUNHA 2</p>
        <p style="margin: 0 0 5px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0; font-size: 10pt;">CPF: ___________________________________________</p>
      </div>

      <div class="contract-footer">
        <p style="margin: 0;">${p.vendorName}${p.documentFmt ? ` — ${docLabel} ${p.documentFmt}` : ''}</p>
        ${p.address ? `<p style="margin: 4px 0 0 0;">${p.address}${p.city && p.state ? `, ${p.city} - ${p.state}` : ''}${p.zip ? `, CEP ${p.zip}` : ''}</p>` : ''}
        ${footerContact ? `<p style="margin: 4px 0 0 0;">${footerContact}</p>` : ''}
      </div>
    </div>`;
}
