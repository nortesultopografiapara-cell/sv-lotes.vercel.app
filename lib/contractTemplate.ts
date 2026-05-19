const extenso = require('extenso');

interface GenerateContractParams {
    tenant: any;
    customer: any;
    project: any;
    block: any;
    sale: any;
    contractDate?: string;
}

export function generateContractHTML({ tenant, customer, project, block, sale, contractDate }: GenerateContractParams) {
    const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('pt-BR');
    };
    
    // Extenso support for currency
    const extensoOptions = { mode: 'currency', currency: { type: 'BRL' } };
    
    const empresaNome = tenant?.razao_social || tenant?.name || 'EMPRESA NÃO INFORMADA';
    const empresaCnpj = tenant?.cnpj || 'CNPJ NÃO INFORMADO';
    const empresaEndereco = tenant?.address || 'ENDEREÇO NÃO INFORMADO';
    const empresaCidade = 'CIDADE NÃO INFORMADA';
    const empresaTelefone = tenant?.phone || 'TELEFONE NÃO INFORMADO';
    const empresaEmail = tenant?.email || 'EMAIL NÃO INFORMADO';
    const empresaLogo = tenant?.logo_url ? `<img src="${tenant?.logo_url}" style="max-height: 80px; margin-bottom: 20px;" alt="Logo"/>` : '';

    const clienteNome = customer?.name || 'CLIENTE NÃO INFORMADO';
    const clienteCpfCnpj = customer?.document || customer?.cpf || 'CPF/CNPJ NÃO INFORMADO';
    const clienteRg = customer?.rg || 'RG NÃO INFORMADO';
    const clienteProfissao = customer?.profession || 'PROFISSÃO NÃO INFORMADA';
    const clienteEstadoCivil = customer?.civil_state || customer?.marital_status || 'ESTADO CIVIL NÃO INFORMADO';
    const clienteEndereco = customer?.address || customer?.street || 'ENDEREÇO NÃO INFORMADO';
    const clienteCidade = customer?.city || 'CIDADE NÃO INFORMADA';

    const projetoNome = project?.name || 'PROJETO NÃO INFORMADO';
    const quadra = block?.block_name || block?.name || 'QUADRA NÃO INFORMADA';
    const lote = block?.number || 'LOTE NÃO INFORMADO';
    const areaM2 = block?.area || 'ÁREA NÃO INFORMADA';
    const frente = block?.front_size || 'FRENTE NÃO INFORMADA';
    const fundo = block?.back_size || 'FUNDO NÃO INFORMADO';
    const lateralDireita = block?.right_side || 'LATERAL DIR. NÃO INFORMADA';
    const lateralEsquerda = block?.left_side || 'LATERAL ESQ. NÃO INFORMADA';
    const cidadeImovel = project?.city || 'CIDADE NÃO INFORMADA';

    let valTotal = Number(sale?.final_value || sale?.total_value || sale?.agreed_price || block?.price || 0);
    const valEntrada = Number(sale?.down_payment || 0);
    
    // Fallback if somehow value logic misses something
    if (valTotal <= 0 && block?.price) valTotal = Number(block.price);

    const valorTotalFmt = formatBRL(valTotal);
    
    let valorTotalExtenso = '';
    try { 
        // @ts-ignore
        valorTotalExtenso = extenso(valTotal.toFixed(2).replace('.', ','), { mode: 'currency' }); 
    } catch(e) {}

    const tipoVenda = sale?.payment_type?.toLowerCase() === 'à vista' || sale?.payment_type === 'A vista' ? 'À Vista' : 'Parcelada';
    const valorEntradaFmt = formatBRL(valEntrada);
    
    let valorEntradaExtenso = '';
    try { 
        // @ts-ignore
        if (valEntrada > 0) valorEntradaExtenso = extenso(valEntrada.toFixed(2).replace('.', ','), { mode: 'currency' }); 
    } catch(e) {}

    const qtdParcelas = sale?.installments_count || 1;
    let valorParcela = 0;
    if (qtdParcelas > 0) {
        valorParcela = (valTotal - valEntrada) / qtdParcelas;
    }
    const valorParcelaFmt = formatBRL(valorParcela);
    let valorParcelaExtenso = '';
    try { 
        // @ts-ignore
        if (valorParcela > 0) valorParcelaExtenso = extenso(valorParcela.toFixed(2).replace('.', ','), { mode: 'currency' }); 
    } catch(e) {}

    // Tentativa de calcular primeira parcela
    // Vence 30 dias após data de criação da venda ou entrada
    const dContrato = new Date(contractDate || sale?.created_at || new Date());
    const dataContratoFmt = dContrato.toLocaleDateString('pt-BR');
    
    const dPrimeira = new Date(dContrato);
    dPrimeira.setMonth(dPrimeira.getMonth() + 1);
    const dataPrimeiraParcelaFmt = dPrimeira.toLocaleDateString('pt-BR');

    const dUltima = new Date(dPrimeira);
    dUltima.setMonth(dUltima.getMonth() + (qtdParcelas - 1));
    const dataUltimaParcelaFmt = dUltima.toLocaleDateString('pt-BR');

    let clPagamento = '';
    if (tipoVenda === 'À Vista') {
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
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.6; color: #000; background: #fff; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
                ${empresaLogo}
                <h1 style="font-size: 18px; margin: 0; text-transform: uppercase;">INSTRUMENTO PARTICULAR DE COMPRA E VENDA</h1>
            </div>

            <p style="text-align: justify; margin-bottom: 20px;">
                Pelo presente instrumento particular de compra e venda, de um lado, como <strong>PROMITENTE VENDEDOR</strong>, a empresa <strong>${empresaNome}</strong>, inscrita no CNPJ sob o n° ${empresaCnpj}, com sede à ${empresaEndereco}, ${empresaCidade}, telefone ${empresaTelefone}, e-mail ${empresaEmail}.
            </p>

            <p style="text-align: justify; margin-bottom: 20px;">
                De outro lado, como <strong>PROMITENTE COMPRADOR</strong>, <strong>${clienteNome}</strong>, portador do RG n° ${clienteRg}, e inscrito no CPF/CNPJ sob o n° ${clienteCpfCnpj}, profissão: ${clienteProfissao}, estado civil: ${clienteEstadoCivil}, residente e domiciliado à ${clienteEndereco}, ${clienteCidade}.
            </p>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA PRIMEIRA - DO IMÓVEL</h3>
            <p style="text-align: justify; margin-bottom: 20px;">
                O VENDEDOR é legítimo possuidor e proprietário do imóvel designado por: Lote <strong>${lote}</strong>, da Quadra <strong>${quadra}</strong>, do loteamento denominado <strong>${projetoNome}</strong>, localizado na cidade de ${cidadeImovel}, com área total de <strong>${areaM2} m²</strong>, com as seguintes confrontações: Frente: ${frente}, Fundo: ${fundo}, Lateral Direita: ${lateralDireita} e Lateral Esquerda: ${lateralEsquerda}.
            </p>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA SEGUNDA - DO PREÇO E DA CONDIÇÃO DE PAGAMENTO</h3>
            <div style="text-align: justify; margin-bottom: 20px;">
                ${clPagamento}
            </div>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA TERCEIRA - DA POSSE</h3>
            <p style="text-align: justify; margin-bottom: 20px;">
                O COMPRADOR será imitido na posse do imóvel a partir da assinatura do presente contrato, podendo assim edificar, desde que obedeça aos critérios exigidos pelos órgãos públicos (Prefeitura).
            </p>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA QUARTA - DAS DESPESAS</h3>
            <p style="text-align: justify; margin-bottom: 20px;">
                Correrão por conta exclusiva do COMPRADOR, a partir desta data, todos os impostos, taxas, contribuições de melhoria e demais tributos que incidam ou venham a incidir sobre o referido lote.
            </p>

            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA QUINTA - DA TRANSFERÊNCIA E ESCRITURA</h3>
            <p style="text-align: justify; margin-bottom: 20px;">
                A escritura pública definitiva será outorgada ao COMPRADOR somente após a liquidação total e irrevogável do preço estipulado, bem como das demais obrigações contratuais, correndo todas as despesas decorrentes da transmissão e escrituração (ITBI, custas cartoriais, etc.) por sua conta.
            </p>
            
            <h3 style="margin-top: 30px; margin-bottom: 15px;">CLÁUSULA SEXTA - INADIMPLEMENTO E RESCISÃO</h3>
             <p style="text-align: justify; margin-bottom: 20px;">
                O descumprimento de qualquer cláusula acarretará a rescisão deste contrato, sujeitando a parte infratora ao pagamento de multa penal. No caso de atraso na parcela, incidirá juros e correção firmados nos moldes da Lei.
            </p>

            <p style="text-align: justify; margin-bottom: 40px; margin-top: 40px;">
                E por estarem justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.
            </p>

            <div style="text-align: right; margin-bottom: 60px;">
                <p>${empresaCidade}, ${dataContratoFmt}</p>
            </div>

            <table style="width: 100%; text-align: center; margin-top: 40px; border-collapse: collapse;">
                <tr>
                    <td style="width: 45%; padding-bottom: 20px;">
                        <div style="border-bottom: 1px solid #000; width: 100%; height: 50px;"></div>
                        <p style="margin-top: 5px; font-weight: bold;">${empresaNome}</p>
                        <p style="margin-top: 0; font-size: 12px;">PROMITENTE VENDEDOR</p>
                    </td>
                    <td style="width: 10%;"></td>
                    <td style="width: 45%; padding-bottom: 20px;">
                        <div style="border-bottom: 1px solid #000; width: 100%; height: 50px;"></div>
                        <p style="margin-top: 5px; font-weight: bold;">${clienteNome}</p>
                        <p style="margin-top: 0; font-size: 12px;">PROMITENTE COMPRADOR</p>
                    </td>
                </tr>
                <tr>
                    <td style="width: 45%;">
                        <div style="border-bottom: 1px solid #000; width: 100%; height: 50px;"></div>
                        <p style="margin-top: 5px; font-weight: bold;">Testemunha 1</p>
                        <p style="margin-top: 0; font-size: 12px;">CPF:</p>
                    </td>
                    <td style="width: 10%;"></td>
                    <td style="width: 45%;">
                        <div style="border-bottom: 1px solid #000; width: 100%; height: 50px;"></div>
                        <p style="margin-top: 5px; font-weight: bold;">Testemunha 2</p>
                        <p style="margin-top: 0; font-size: 12px;">CPF:</p>
                    </td>
                </tr>
            </table>
        </div>
    `;
}
