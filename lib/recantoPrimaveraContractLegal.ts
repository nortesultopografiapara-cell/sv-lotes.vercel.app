/**
 * Cláusulas legais do modelo Recanto Primavera (Ivanilde).
 * Texto jurídico dedicado — dados cadastrais vêm de Configurações → Empresa.
 */

import type { SaleContractRenderContext } from '@/lib/saleContractContext';

export const RECANTO_PRIMAVERA_CONTRACT_TITLE =
  'INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL';

/** Marcador estável para testes — distingue do modelo Meneses/PADRAO. */
export const RECANTO_PRIMAVERA_LEGAL_MARKER =
  'As partes qualificadas acima celebram o presente instrumento';

export function buildRecantoPrimaveraVendorHeaderHtml(
  ctx: SaleContractRenderContext,
): string {
  const cepLine =
    ctx.empresaCep && !/^não informado$/i.test(ctx.empresaCep)
      ? `, CEP ${ctx.empresaCep}`
      : '';

  const representanteLine =
    ctx.empresaRepresentante && !/^não informado$/i.test(ctx.empresaRepresentante)
      ? `<p style="margin: 0 0 4px 0;"><strong>Responsável:</strong> ${ctx.empresaRepresentante}${
          ctx.empresaRepresentanteDocFmt
            ? ` — ${ctx.empresaDocumentoLabel}: ${ctx.empresaRepresentanteDocFmt}`
            : ''
        }</p>`
      : '';

  return `
            <div class="contract-header-recanto" style="text-align: center; margin-bottom: 18px;">
                ${ctx.empresaLogoHtml}
                <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 17px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px 0; padding: 0; line-height: 1.3;">${RECANTO_PRIMAVERA_CONTRACT_TITLE}</h2>
            </div>

            <div class="contract-clause contract-vendor-block" style="margin-bottom: 14px; padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px;">
                <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase;">VENDEDOR(A):</p>
                <p style="margin: 0 0 4px 0;"><strong>${ctx.empresaNome}</strong></p>
                <p style="margin: 0 0 4px 0;"><strong>${ctx.empresaDocumentoLabel}:</strong> ${ctx.empresaDocumentoFmt}</p>
                <p style="margin: 0 0 4px 0;"><strong>Telefone:</strong> ${ctx.empresaTelefone}</p>
                <p style="margin: 0 0 4px 0;"><strong>E-mail:</strong> ${ctx.empresaEmail}</p>
                <p style="margin: 0 0 4px 0;"><strong>Endereço:</strong> ${ctx.empresaEndereco}${cepLine}</p>
                <p style="margin: 0 0 4px 0;"><strong>Cidade:</strong> ${ctx.empresaCidade}/${ctx.empresaUf}</p>
                ${representanteLine}
            </div>`;
}

export function buildRecantoPrimaveraBuyerClauseHtml(
  ctx: SaleContractRenderContext,
): string {
  return `
            <div class="contract-clause" style="margin-bottom: 14px;">
                <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase;">COMPRADOR(A):</p>
                <p style="margin: 0;">
                    <strong>${ctx.clienteNome}</strong>, CPF n° ${ctx.clienteCpfCnpj}, Brasileiro(a), Profissão: ${ctx.clienteProfissao}, Estado Civil: ${ctx.clienteEstadoCivil}${ctx.clienteIdentitySuffix}${ctx.clienteConjugeSuffix}, residente e domiciliado(a) na ${ctx.clienteEndereco}, Bairro ${ctx.clienteBairro}, CEP: ${ctx.clienteCep}, Cidade de ${ctx.clienteCidade} - ${ctx.clienteUf}.
                </p>
            </div>`;
}

export function buildRecantoPrimaveraLegalBodyHtml(
  ctx: SaleContractRenderContext,
  lotArea: string,
): string {
  return `
            <div class="contract-preamble">
                <p style="margin-bottom: 0;">
                    ${RECANTO_PRIMAVERA_LEGAL_MARKER}, que se regerá pelas cláusulas e condições a seguir, mutuamente aceitas e outorgadas, obrigando-se as partes, seus herdeiros e sucessores, na forma da lei:
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Primeira — Do Objeto:</strong> O(A) VENDEDOR(A) declara-se legítimo(a) possuidor(a), livre e desembaraçado(a) de quaisquer ônus, do imóvel identificado como <strong>LOTE ${ctx.lote} DA QUADRA ${ctx.quadra}</strong>${ctx.projectDescString}${ctx.lotLocationSuffix}, com área total de <strong>${lotArea}</strong>, ${ctx.lotBoundariesClause}${ctx.curvaClause}
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Segunda — Da Promessa:</strong> Pelo presente instrumento, o(a) VENDEDOR(A) promete vender ao(à) COMPRADOR(A), que promete comprar, o imóvel descrito na cláusula primeira, pelo preço e condições estabelecidos nas cláusulas seguintes.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Terceira — Do Preço:</strong> O valor total da presente promessa é de <strong>${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})</strong>, negociado de forma <strong>${ctx.tipoVenda.toUpperCase()}</strong>, a ser pago pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A) conforme cláusula quarta.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Único:</strong> A posse do imóvel fica limitada ao(à) COMPRADOR(A) a partir da assinatura do presente instrumento e do cumprimento das condições aqui previstas.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                ${ctx.clauseQuartaHtml}
            </div>

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

            ${ctx.forumClauseHtml}`;
}

export function buildRecantoPrimaveraSignaturesHtml(
  ctx: SaleContractRenderContext,
): string {
  const docLabel = ctx.empresaDocumentoLabel;
  return `
            <div class="contract-clause">
                <p style="margin-bottom: 20px;">
                    E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
                </p>
                <div style="text-align: right; margin-bottom: 30px;">
                    <p style="margin: 0;">${ctx.empresaCidade} - ${ctx.empresaUf}, ${ctx.dataContratoFmt}</p>
                </div>
            </div>

            <div class="contract-signatures">
                <div class="signature-slot">
                    ${ctx.empresaAssinatura}
                    <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
                    <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${ctx.empresaNome}</p>
                    <p style="margin: 0; font-size: 10pt; font-weight: normal;">VENDEDOR(A)<br/>${docLabel}: ${ctx.empresaDocumentoFmt}</p>
                    ${ctx.representanteAssinaturaHtml}
                </div>

                <div class="signature-slot">
                    <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
                    <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${ctx.clienteNome}</p>
                    <p style="margin: 0; font-size: 10pt; font-weight: normal;">COMPRADOR(A)<br/>CPF: ${ctx.clienteCpfCnpj}</p>
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
                    <p style="margin: 0;">${ctx.empresaNome} — ${docLabel} ${ctx.empresaDocumentoFmt}</p>
                    <p style="margin: 4px 0 0 0;">${ctx.empresaEndereco}, ${ctx.empresaCidade} - ${ctx.empresaUf}, CEP ${ctx.empresaCep}</p>
                    ${ctx.vendedorContato ? `<p style="margin: 4px 0 0 0;">${ctx.vendedorContato}</p>` : ''}
                </div>
            </div>`;
}
