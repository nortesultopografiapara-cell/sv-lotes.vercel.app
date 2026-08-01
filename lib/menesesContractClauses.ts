/**
 * Corpo jurídico novo — modelo MENESES apenas.
 * Preserva layout/classes do contrato clássico; não altera PADRAO/Recanto/SV2.
 */

export type MenesesClausesContext = {
  /** Ex.: LOTE 05 DA QUADRA 12 */
  loteLabel: string;
  quadra: string;
  lote: string;
  areaFmt: string;
  /** Texto já formatado: "apresentando as seguintes dimensões..." */
  lotBoundariesClause: string;
  curvaClause: string;
  /** Ex.: ", integrante do empreendimento X, localizado no município de Y - UF" */
  projectDescString: string;
  lotLocationSuffix: string;
  /** Ex.: da Comarca de <strong>Cidade - UF</strong> */
  foroText: string;
};

function clauseBlock(inner: string): string {
  return `
            <div class="contract-clause" style="padding-bottom: 5px;">
                ${inner}
            </div>`;
}

/**
 * Cláusulas 1–14 do modelo Meneses (texto jurídico aprovado).
 * Valores dinâmicos via interpolação JS — nunca literais {{VAR}} ou {% if %}.
 */
export function buildMenesesClausesHtml(ctx: MenesesClausesContext): string {
  const loteStrong = String(ctx.loteLabel || '').trim() || 'LOTE — DA QUADRA —';
  const area = String(ctx.areaFmt || '').trim() || 'área não informada';
  const boundaries = String(ctx.lotBoundariesClause || '').trim();
  const curva = String(ctx.curvaClause || '').trim();
  const projectDesc = String(ctx.projectDescString || '');
  const location = String(ctx.lotLocationSuffix || '');
  const foro = String(ctx.foroText || '').trim() || 'competente';

  const objetoImovel = `o imóvel identificado como <strong>${loteStrong}</strong>${projectDesc}${location}, com área total de <strong>${area}</strong>${
    boundaries ? `, ${boundaries}` : ''
  }${curva}`;

  return [
    clauseBlock(`
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Primeira — Das Declarações Iniciais:</strong> O(A) PROMISSÁRIO(A) COMPRADOR(A) declara, sob as penas da lei civil e criminal, que todas as informações cadastrais prestadas ao PROMITENTE VENDEDOR são verdadeiras, exatas e atualizadas, obrigando-se a comunicar qualquer alteração em seus dados no prazo máximo de 10 (dez) dias úteis, contado da respectiva ocorrência.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Segunda — Do Objeto:</strong> O PROMITENTE VENDEDOR declara-se legítimo possuidor e titular dos direitos possessórios do imóvel objeto deste contrato, livre e desembaraçado de quaisquer ônus, dívidas ou litígios de seu conhecimento.
                </p>
                <p style="margin-bottom: 0;">
                    O imóvel objeto deste contrato corresponde a ${objetoImovel}.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Terceira — Do Preço e da Forma de Pagamento:</strong> O preço certo, justo e contratado para a presente alienação, bem como as condições de quitação, prazos, vencimentos, sinal de negócio, entrada, saldo, quantidade e valor das parcelas, eventuais parcelas balão, reajustes e demais condições financeiras, observarão integralmente as especificações constantes do Quadro Financeiro, do Quadro-Resumo e da Tabela de Pagamentos integrantes deste instrumento.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> O pagamento das parcelas será realizado pelos meios oficialmente disponibilizados pelo PROMITENTE VENDEDOR ou por sua administradora, incluindo boleto bancário, PIX ou outro canal financeiro habilitado na Central do Cliente do SV LOTES, observada a conta financeira vinculada à respectiva venda.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> Os vencimentos ocorrerão nas datas estabelecidas no Quadro Financeiro e na Tabela de Pagamentos.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Terceiro:</strong> O eventual não recebimento do boleto, cobrança ou comunicação de vencimento não exime o(a) PROMISSÁRIO(A) COMPRADOR(A) da obrigação de pagamento na data ajustada, cabendo-lhe acessar a Central do Cliente do SV LOTES ou contatar a administradora com antecedência mínima de 5 (cinco) dias do vencimento para obtenção da segunda via ou de outro meio autorizado de pagamento.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Quarto:</strong> Quaisquer alterações de endereço, telefone ou e-mail deverão ser comunicadas e atualizadas pelo(a) PROMISSÁRIO(A) COMPRADOR(A), sendo consideradas válidas as notificações encaminhadas aos dados cadastrais existentes enquanto não houver comunicação formal da alteração.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Quarta — Da Inadimplência e das Sanções:</strong> O atraso no pagamento de qualquer parcela sujeitará o débito às seguintes penalidades financeiras, aplicadas a partir do dia imediatamente posterior ao vencimento:
                </p>
                <p style="margin-bottom: 6px;">a) multa moratória de 2% (dois por cento) sobre o valor atualizado da parcela em atraso;</p>
                <p style="margin-bottom: 10px;">b) juros moratórios de 1% (um por cento) ao mês, calculados <em>pro rata die</em> até a efetiva liquidação do débito.</p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> A inadimplência correspondente a 3 (três) parcelas, consecutivas ou alternadas, facultará ao PROMITENTE VENDEDOR promover a resolução do contrato, observadas as notificações, os procedimentos e a legislação aplicável, sem prejuízo da possibilidade de composição amigável formalizada por escrito.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Segundo:</strong> Fica expressamente vedado ao(à) PROMISSÁRIO(A) COMPRADOR(A) subdividir, desmembrar ou lotear o imóvel objeto deste instrumento antes da quitação integral do preço ajustado e sem a prévia autorização dos órgãos competentes.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Quinta — Da Posse e da Regularização Imobiliária:</strong> Com a assinatura deste instrumento, o PROMITENTE VENDEDOR imite o(a) PROMISSÁRIO(A) COMPRADOR(A) na posse direta e provisória do imóvel, vinculada ao fiel cumprimento das obrigações assumidas neste contrato.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> As partes declaram ciência de que a individualização formal da unidade, a abertura de matrícula autônoma e a outorga da escritura pública definitiva dependem dos procedimentos de regularização fundiária, desmembramento, parcelamento, aprovação e registro perante os órgãos administrativos e registrais competentes.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> O Termo de Quitação Final será disponibilizado no prazo de até 60 (sessenta) dias após a liquidação integral do preço e a confirmação de inexistência de obrigações financeiras pendentes.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Terceiro:</strong> Todos os tributos, impostos, taxas, contribuições ambientais, contribuições de melhoria e demais encargos incidentes sobre o imóvel, a partir da transmissão da posse, serão de responsabilidade do(a) PROMISSÁRIO(A) COMPRADOR(A), ressalvadas as obrigações que, por lei ou por previsão expressa deste instrumento, sejam atribuídas ao PROMITENTE VENDEDOR.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Quarto:</strong> A cessão ou transferência dos direitos e obrigações decorrentes deste contrato dependerá da anuência prévia e escrita do PROMITENTE VENDEDOR e da adimplência do(a) PROMISSÁRIO(A) COMPRADOR(A). Pela transferência, poderá ser cobrado, a título de ressarcimento de despesas administrativas, o valor equivalente a 1 (uma) parcela vigente.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Quinto:</strong> Caso terceiros ou confrontantes invadam, ocupem ou ultrapassem os marcos divisórios da unidade após a transmissão da posse, o(a) PROMISSÁRIO(A) COMPRADOR(A) deverá comunicar a administração do empreendimento e o PROMITENTE VENDEDOR para avaliação e tentativa de solução conjunta.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Sexto:</strong> Permanece expressamente proibida qualquer redivisão ou subfracionamento do imóvel sem a observância das exigências legais e sem as autorizações necessárias.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Sexta — Das Condições Físicas e da Manutenção do Imóvel:</strong> O(A) PROMISSÁRIO(A) COMPRADOR(A) declara ter realizado prévia vistoria <em>in loco</em>, conhecendo a localização, as confrontações, a topografia e o estado de conservação do imóvel, aceitando-o nas condições em que se encontra, ressalvados eventuais vícios ocultos e as garantias legalmente aplicáveis.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> O PROMITENTE VENDEDOR não se obriga à execução de serviços individualizados de terraplanagem, roçada, remoção de árvores, tocos ou pedras, contenções de solo ou outras intervenções que não estejam expressamente previstas no memorial, projeto ou infraestrutura oferecida para o empreendimento.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> O PROMITENTE VENDEDOR não garante a existência de lençol freático ou de água no subsolo, nem responde por alagamentos, erosões ou instabilidades geológicas decorrentes de condições naturais do terreno, ressalvadas as responsabilidades legalmente atribuíveis.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Terceiro:</strong> O(A) PROMISSÁRIO(A) COMPRADOR(A) obriga-se a manter o imóvel limpo e conservado, respondendo pelos danos, focos de incêndio, descarte indevido de lixo, entulho, resíduos ou infrações ambientais decorrentes de sua conduta ou omissão.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Quarto:</strong> O PROMITENTE VENDEDOR não responde por furtos, roubos, sinistros ou acidentes ocorridos na área privativa ou nas vias comuns do empreendimento, ressalvadas as hipóteses em que fique demonstrada responsabilidade legal direta.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Sétima — Das Servidões e das Restrições de Uso:</strong> O(A) PROMISSÁRIO(A) COMPRADOR(A) compromete-se a respeitar as faixas de servidão administrativa, redes e linhas de transmissão de energia, faixas de domínio de estradas, áreas ambientalmente protegidas e demais restrições legais ou técnicas incidentes sobre o imóvel.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Único:</strong> Fica proibida, nas faixas demarcadas ou legalmente protegidas, a realização de edificações, plantações ou intervenções incompatíveis com a respectiva servidão ou restrição, respondendo o(a) PROMISSÁRIO(A) COMPRADOR(A) pelas consequências decorrentes do descumprimento.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Oitava — Do Abastecimento de Água e do Saneamento:</strong> Ressalvada previsão diversa constante do Memorial Descritivo, do projeto aprovado ou da oferta do empreendimento, a implantação e a manutenção da infraestrutura individual de abastecimento de água e saneamento serão de responsabilidade do(a) PROMISSÁRIO(A) COMPRADOR(A).
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Único:</strong> A perfuração de poços, instalação de fossas, sistemas de tratamento ou outras soluções individuais dependerá das licenças, autorizações, outorgas e exigências dos órgãos ambientais, sanitários e municipais competentes.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Nona — Da Rescisão Contratual e da Cláusula Penal:</strong> A rescisão contratual motivada pelo inadimplemento ou pela desistência injustificada do(a) PROMISSÁRIO(A) COMPRADOR(A) sujeitará a parte responsável à cláusula penal compensatória equivalente a 20% (vinte por cento) do valor total atualizado do contrato, observados os limites, procedimentos e direitos previstos na legislação aplicável.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Único:</strong> A apuração dos valores a restituir ou compensar considerará, quando aplicável, os valores efetivamente pagos, a cláusula penal, encargos vencidos, tributos, despesas comprovadas, danos ao imóvel, fruição da unidade e demais parcelas admitidas pela legislação.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Décima — Da Devolução de Valores e das Benfeitorias:</strong> Ocorrendo a rescisão motivada pelo(a) PROMISSÁRIO(A) COMPRADOR(A), os valores pagos serão restituídos conforme o montante efetivamente quitado e de acordo com a seguinte gradação contratual, sem prejuízo da adequação obrigatória aos limites legais aplicáveis ao caso concreto:
                </p>
                <p style="margin-bottom: 6px;">a) pagamento de até 10% (dez por cento) do valor atualizado do contrato: restituição de 20% (vinte por cento) do montante pago;</p>
                <p style="margin-bottom: 6px;">b) pagamento superior a 10% (dez por cento) e de até 30% (trinta por cento) do valor atualizado do contrato: restituição de 40% (quarenta por cento) do montante pago;</p>
                <p style="margin-bottom: 6px;">c) pagamento superior a 30% (trinta por cento) e de até 70% (setenta por cento) do valor atualizado do contrato: restituição de 60% (sessenta por cento) do montante pago;</p>
                <p style="margin-bottom: 10px;">d) pagamento superior a 70% (setenta por cento) do valor atualizado do contrato: restituição de 70% (setenta por cento) do montante pago.</p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> A restituição apurada poderá ser realizada no mesmo número de parcelas correspondentes aos pagamentos efetuados, observada a legislação aplicável e eventual acordo formal entre as partes.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> As benfeitorias necessárias ou úteis realizadas pelo(a) PROMISSÁRIO(A) COMPRADOR(A), quando indenizáveis, serão inicialmente avaliadas por acordo entre as partes.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Terceiro:</strong> Não havendo consenso, o valor das benfeitorias será apurado com base na média de 3 (três) avaliações técnicas elaboradas por profissionais legalmente habilitados, escolhidos de comum acordo, correndo os custos da avaliação por conta da parte responsável pela rescisão, salvo disposição legal ou acordo em sentido diverso.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Quarto:</strong> O pagamento de eventual indenização por benfeitorias poderá ser vinculado à nova alienação da unidade a terceiro, desde que essa condição seja juridicamente válida para a situação concreta e formalmente reconhecida entre as partes.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Décima Primeira — Da Proteção de Dados Pessoais:</strong> As partes declaram ciência de que os dados pessoais fornecidos serão tratados para a execução deste contrato, administração da venda, emissão e gestão de cobranças, comunicação com os signatários, assinatura eletrônica, prevenção a fraudes, cumprimento de obrigações legais e exercício regular de direitos.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> O tratamento deverá observar a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais — e as demais normas aplicáveis.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Segundo:</strong> Os dados e evidências necessários à comprovação da contratação e das assinaturas poderão ser armazenados pelo período exigido pela legislação ou necessário ao exercício regular de direitos.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Décima Segunda — Da Irrevogabilidade, da Irretratabilidade e da Eficácia:</strong> Ressalvadas as hipóteses de rescisão, resolução, distrato ou exercício de direitos previstos neste instrumento ou na legislação, o presente contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes e seus herdeiros e sucessores ao fiel cumprimento de seus termos.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Décima Terceira — Da Assinatura Eletrônica:</strong> As partes reconhecem e concordam que o presente contrato poderá ser formalizado por meio de assinatura eletrônica realizada pela plataforma SV LOTES, mediante link individual, identificação do signatário, manifestação de aceite, registro de CPF ou CNPJ, endereço IP, data e hora, histórico de visualização e assinatura, token de autenticação e demais evidências eletrônicas geradas pelo sistema.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> A assinatura eletrônica realizada na plataforma SV LOTES possui validade jurídica e eficácia probatória, nos termos da Medida Provisória nº 2.200-2/2001, da Lei nº 14.063/2020 e das demais normas aplicáveis.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> O certificado eletrônico de assinatura e os registros de acesso, visualização, aceite, endereço IP, data, hora e identificação do signatário integram este contrato para todos os fins de direito e constituem evidências da manifestação de vontade das partes.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Terceiro:</strong> A assinatura eletrônica produz os efeitos jurídicos do documento assinado, sem prejuízo da possibilidade de assinatura física complementar quando exigida por lei ou convencionada pelas partes.
                </p>`),

    clauseBlock(`
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Décima Quarta — Do Foro:</strong> Para dirimir controvérsias decorrentes da interpretação ou execução deste instrumento, as partes elegem o foro ${foro}, renunciando a qualquer outro, por mais privilegiado que seja ou venha a ser, ressalvadas as regras legais de competência obrigatória.
                </p>`),
  ].join('\n');
}
