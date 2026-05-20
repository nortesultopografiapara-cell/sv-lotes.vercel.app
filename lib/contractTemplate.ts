const extenso = require("extenso");

interface GenerateContractParams {
  tenant: any;
  customer: any;
  project: any;
  block: any;
  sale: any;
  contractSnapshot?: any;
  contractDate?: string;
}

export function generateContractHTML({
  tenant,
  customer,
  project,
  block,
  sale,
  contractSnapshot,
  contractDate,
}: GenerateContractParams) {
  const formatBRL = (val: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("pt-BR");
  };

  // Extenso support for currency
  const extensoOptions = { mode: "currency", currency: { type: "BRL" } };

  const empresaNome =
    tenant?.razao_social || tenant?.name || "empresa não informada";
  const empresaCnpj = tenant?.cnpj || "CNPJ não informado";
  const empresaEndereco = tenant?.address || "endereço não informado";
  const empresaCidade = tenant?.city || "cidade não informada";
  const empresaTelefone = tenant?.phone || "telefone não informado";
  const empresaEmail = tenant?.email || "email não informado";
  const empresaLogo = tenant?.logo_url
    ? `<img src="${tenant?.logo_url}" style="max-height: 80px; margin-bottom: 20px;" alt="Logo"/>`
    : "";

  const clienteNome = customer?.name || "cliente não informado";
  const clienteCpfCnpj =
    customer?.document || customer?.cpf || "cpf/cnpj não informado";
  const clienteRg = customer?.rg || "rg não informado";
  const clienteProfissao = customer?.profession || "profissão não informada";
  const clienteEstadoCivil =
    customer?.civil_state || "estado civil não informado";
  const clienteEndereco =
    customer?.address || customer?.street || "endereço não informado";
  const clienteBairro = customer?.neighborhood || "bairro não informado";
  const clienteCidade = customer?.city || "cidade não informada";
  const clienteUf = customer?.state_uf || "UF não informada";
  const clienteCep = customer?.zip_code || "cep não informado";

  const projetoNome =
    contractSnapshot?.project_name_snapshot ||
    project?.name ||
    sale?.projects?.name ||
    block?.projects?.name ||
    "Projeto não informado";

  const quadra =
    block?.block_name ||
    block?.name ||
    block?.number ||
    sale?.blocks?.block_name ||
    sale?.blocks?.name ||
    "Quadra não informada";
  const lote = block?.number || sale?.blocks?.number || "Lote não informado";

  const areaM2 = block?.area || "Área não informada";
  const frente = block?.frente || "Frente não informada";
  const fundo = block?.fundo || "Fundo não informado";
  const lateralDireita = block?.lado_direito || "Lateral dir. não informada";
  const lateralEsquerda = block?.lado_esquerdo || "Lateral esq. não informada";

  // Cidade, UF e Foro hierarquia correta
  const cidadeImovel =
    contractSnapshot?.project_city_snapshot ||
    project?.city ||
    block?.projects?.city ||
    sale?.projects?.city ||
    "Cidade não informada";

  const ufImovel =
    contractSnapshot?.project_uf_snapshot ||
    project?.uf ||
    block?.projects?.uf ||
    sale?.projects?.uf ||
    "UF não informada";

  const foroCidade =
    contractSnapshot?.forum_city_snapshot ||
    project?.forum_city ||
    block?.projects?.forum_city ||
    sale?.projects?.forum_city ||
    contractSnapshot?.project_city_snapshot ||
    project?.city ||
    cidadeImovel;
  const foroUf = ufImovel;

  let valTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    Number(block?.price) ||
    0;

  // Se ainda for zero e houver recibos (finance_receipts não é passado no escopo atual, mas podemos somar receipts_sum se injetado)
  if (valTotal <= 0 && sale?.receipts_sum) {
    valTotal = Number(sale.receipts_sum);
  }

  if (valTotal <= 0 && block?.price) valTotal = Number(block.price);

  const valEntrada = Number(sale?.down_payment || 0);

  const valorTotalFmt = formatBRL(valTotal);

  let valorTotalExtenso = "";
  try {
    // @ts-ignore
    valorTotalExtenso = extenso(valTotal.toFixed(2).replace(".", ","), {
      mode: "currency",
    });
  } catch (e) {}

  const tipoVenda =
    sale?.payment_type?.toLowerCase() === "à vista" ||
    sale?.payment_type === "A vista"
      ? "À Vista"
      : "Parcelada";
  const valorEntradaFmt = formatBRL(valEntrada);

  let valorEntradaExtenso = "";
  try {
    // @ts-ignore
    if (valEntrada > 0)
      valorEntradaExtenso = extenso(valEntrada.toFixed(2).replace(".", ","), {
        mode: "currency",
      });
  } catch (e) {}

  const qtdParcelas = sale?.installments_count || 1;
  let valorParcela = 0;
  if (qtdParcelas > 0) {
    valorParcela = (valTotal - valEntrada) / qtdParcelas;
  }
  const valorParcelaFmt = formatBRL(valorParcela);
  let valorParcelaExtenso = "";
  try {
    // @ts-ignore
    if (valorParcela > 0)
      valorParcelaExtenso = extenso(valorParcela.toFixed(2).replace(".", ","), {
        mode: "currency",
      });
  } catch (e) {}

  // Tentativa de calcular primeira parcela
  // Vence 30 dias após data de criação da venda ou entrada
  const dContrato = new Date(contractDate || sale?.created_at || new Date());
  const dataContratoFmt = dContrato.toLocaleDateString("pt-BR");

  const dPrimeira = new Date(dContrato);
  dPrimeira.setMonth(dPrimeira.getMonth() + 1);
  const dataPrimeiraParcelaFmt = dPrimeira.toLocaleDateString("pt-BR");

  const dUltima = new Date(dPrimeira);
  dUltima.setMonth(dUltima.getMonth() + (qtdParcelas - 1));
  const dataUltimaParcelaFmt = dUltima.toLocaleDateString("pt-BR");

  let clPagamento = "";
  if (tipoVenda === "À Vista") {
    clPagamento = `<p>O preço certo e ajustado da presente compra e venda é de <strong>${valorTotalFmt}</strong> (${valorTotalExtenso}), que o COMPRADOR pagará ao VENDEDOR neste ato, valendo este contrato como recibo.</p>`;
  } else {
    clPagamento = `
            <p>O preço certo e ajustado da presente compra e venda é de <strong>${valorTotalFmt}</strong> (${valorTotalExtenso}), que o COMPRADOR pagará ao VENDEDOR da seguinte forma:</p>
            <ul>
                <li>Entrada: <strong>${valorEntradaFmt}</strong> (${valorEntradaExtenso}), paga no ato da assinatura.</li>
                <li>Restante: Dividido em <strong>${qtdParcelas}</strong> parcelas mensais e sucessivas no valor de <strong>${valorParcelaFmt}</strong> (${valorParcelaExtenso}) cada.</li>
                <li>Vencimento da primeira parcela: <strong>${dataPrimeiraParcelaFmt}</strong></li>
                <li>Vencimento da última parcela: <strong>${dataUltimaParcelaFmt}</strong></li>
            </ul>
        `;
  }

  return `
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; color: #000; background: #fff; padding: 40px; text-align: justify;">
            <div style="text-align: left; margin-bottom: 20px;">
                ${empresaLogo}
            </div>
            
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 14pt; margin: 0; font-weight: normal;">INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA</h1>
            </div>

            <p style="margin-bottom: 15px;">
                <strong>Promitente Proprietário Vendedor: ${empresaNome}</strong>, CNPJ n° ${empresaCnpj}, Empresa Constituída e Instalada na ${empresaEndereco}, ${empresaCidade} - PA.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Promitente Comprador: ${clienteNome}</strong> CPF n° ${clienteCpfCnpj}, Brasileiro, Profissão; ${clienteProfissao}, ${clienteEstadoCivil}, Portador cédula de identidade n° ${clienteRg}, Residente e domiciliado na ${clienteEndereco}, Bairro ${clienteBairro} Cep: ${clienteCep} Nesta Cidade de, ${clienteCidade} – ${clienteUf}.
            </p>

            <p style="margin-bottom: 20px;">
                Pelo presente instrumento particular, partes acima qualificadas têm entre si justo e acertado a celebração do presente compromisso de compra e venda que se regerá pelas cláusulas, termos e condições, estipuladas a seguir, que as partes mutuamente outorgam e aceitam, as quais comprometem cumprir e respeitar, por si, seus herdeiros e sucessores, na forma da lei:
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Primeira -:</strong> O PROMITENTE VENDEDOR, pelo presente instrumento e na melhor forma de direito, declara-se senhor e legitimo possuidor, livre e desembaraçado de quaisquer ônus do imóvel a seguir descriminado: Uma chacara, Sendo o <strong>LOTE ${lote} DA QUADRA ${quadra}</strong>, com área total de <strong>${areaM2}m²</strong>, frente <strong>${frente}m</strong>; fundo <strong>${fundo}m</strong> Lateral Esquerda <strong>${lateralEsquerda}m</strong>, lateral direita <strong>${lateralDireita}m</strong>; ${projetoNome}, localizado no município de ${cidadeImovel} – ${ufImovel}.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Segunda -:</strong> Pelo presente instrumento e na melhor forma de direito, o PROMITENTE VENDEDOR promete vender ao PROMISSÁRIO COMPRADOR, que promete comprar, o imóvel descrito na cláusula primeira, pelo preço e condições descritas nas cláusulas seguintes;
            </p>

            <p style="margin-bottom: 10px;">
                <strong>Cláusula Terceira -:</strong> O Valor total do contrato e de <strong>${valorTotalFmt} (${valorTotalExtenso})</strong>, o qual foi negociado de forma <strong>${tipoVenda.toUpperCase()}</strong>, pelo PROMISSÁRIO COMPRADOR ao PROMITENTE VENDEDOR no ato da assinatura do presente contrato, outorgando assim o PROMISSÁRIO VENDEDOR a mais ampla, geral e irrevogável quitação mediante emissão do termo de quitação pelo PROMITENTE VENDEDOR.
            </p>
            <p style="margin-bottom: 15px;">
                <strong>Parágrafo Único -:</strong> O PROMISSÁRIO VENDEDOR fica limitado na posse do imóvel a partir da presente data.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Quarta -:</strong> Fica a cargo exclusivo do PROMISSÁRIO COMPRADOR(A), Fica Com o Valor de <strong>${valorTotalFmt} (${valorTotalExtenso})</strong>, com entrada de <strong>${valorEntradaFmt} (${valorEntradaExtenso})</strong>, e o restante parcelados via boletos bancário em <strong>${qtdParcelas} parcelas iguais no valor de ${valorParcelaFmt} (${valorParcelaExtenso})</strong>. Sendo a primeira parcela para o dia <strong>${dataPrimeiraParcelaFmt}</strong> e a última parcela para o dia <strong>${dataUltimaParcelaFmt}</strong>. Taxas decorrentes do presente contrato e da escritura definitiva de compra e venda, e respectivo registro, bem como todos os impostos e taxas incidentes sobre o imóvel, a partir da assinatura do presente instrumento, são de inteira responsabilidade do PROMISSÁRIO COMPRADOR.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Quinta -:</strong> A não quitação das cláusulas penais ou resolutórias, previstas neste contrato por parte de seus beneficiários, será sempre havida como mera tolerância, não importando nunca em novação das obrigações descumpridas, podendo ser aplicada a qualquer tempo, enquanto subsistir o inadimplemento. Em caso de desistência será ressarcido somente 40% do valor pago.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Sexta -:</strong> Fica estabelecido a irretratabilidade e irrevogabilidade do presente contrato, podendo, se necessário, o PROMITENTE COMPRADOR ou seus eventuais sucessores, requerer adjudicação compulsória dos imóveis, nos termos da legislação vigente.
            </p>

            <p style="margin-bottom: 10px;">
                <strong>Cláusula Sétima -:</strong> Fica estabelecido que a escritura definitiva de compra e venda, somente será outorgada pelo PROMITENTE VENDEDOR ao PROMISSÁRIO COMPRADOR no prazo de seis (6) meses contados da data em que for expedido o decreto aprovando o loteamento.
            </p>
            <p style="margin-bottom: 15px;">
                <strong>Parágrafo Único -:</strong> O prazo previsto no “caput” da presente cláusula será automaticamente prorrogado, se a Prefeitura Municipal não aprovar o loteamento ate tal data, ou qualquer outro motivo de força maior.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Oitava -:</strong> O presente contrato obriga aos contratantes, seus herdeiros e sucessores, os quais deverão igualmente observar e cumprir todos os termos, condições e cláusulas deste instrumento.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Nona -:</strong> Fica estipulado que, a parte que descumprir quaisquer das cláusulas, termos ou condições do presente instrumento, incorrerá na multa penal de dois (2%) por cento do valor total do contrato, atualiza monetariamente de acordo com índice oficial vigente, sem prejuízo das outras penalidades também previstas neste instrumento.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Décima -:</strong> Fica estabelecido que, em havendo necessidade de se recorrer as vias judiciais, para solucionar qualquer controvérsia, a parte vencida arcara, além das despesas e custas processuais, com os honorários advocatícios de vinte (20 %) por cento, em favor da parte vencedora.
            </p>

            <p style="margin-bottom: 15px;">
                <strong>Cláusula Décima Primeira -:</strong> Fica eleito o foro da Comarca de ${foroCidade} – ${foroUf}, para a solução de qualquer questão oriunda do presente contrato, renunciando as partes contratantes e qualquer outro, por mais especial que seja.
            </p>

            <p style="margin-bottom: 30px;">
                E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
            </p>

            <div style="text-align: left; margin-bottom: 40px;">
                <p>${empresaCidade}-${clienteUf} ${dataContratoFmt}</p>
            </div>

            <div style="margin-top: 50px;">
                <div style="border-bottom: 1px dashed #000; width: 400px; margin-bottom: 5px;"></div>
                <p style="margin: 0; font-weight: bold;">Proprietário Vendedor</p>
                <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${empresaNome}</p>
                <p style="margin: 0;">CNPJ n° ${empresaCnpj}</p>
            </div>

            <div style="margin-top: 50px;">
                <div style="border-bottom: 1px dashed #000; width: 400px; margin-bottom: 5px;"></div>
                <p style="margin: 0; font-weight: bold;">COMPRADOR</p>
                <p style="margin: 0; font-weight: bold; text-transform: uppercase;">${clienteNome}</p>
                <p style="margin: 0;">CPF n° ${clienteCpfCnpj} RG n° ${clienteRg}</p>
            </div>

            <div style="margin-top: 50px;">
                <div style="border-bottom: 1px dashed #000; width: 400px; margin-bottom: 5px;"></div>
                <p style="margin: 0; font-weight: bold;">TESTEMUNHA</p>
                <p style="margin: 0;">NOME:</p>
                <p style="margin: 0;">RG: _______________ CPF: _______________</p>
            </div>
        </div>
    `;
}
