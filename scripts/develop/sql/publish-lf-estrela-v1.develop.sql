-- =============================================================================
-- DEVELOP ONLY — projeto hoynysmynxncdlptuzub
-- SQL Editor: https://supabase.com/dashboard/project/hoynysmynxncdlptuzub/sql
-- NÃO executar em Production aezktedncttwpqeunjej
-- NÃO altera projects.contract_model (motor ESTRELA_DO_SUL permanece)
-- NÃO apaga Estrela do Sul / system_seed
-- NÃO marca LF ESTRELA como padrão (o usuário seleciona no dropdown e salva)
-- HTML oficial do commit b346e09 (buildLfEstrelaCustomHtml)
-- =============================================================================

BEGIN;

DO $publish_lf_estrela$
DECLARE
  v_company_id uuid;
  v_project_id uuid;
  v_project_name text;
  v_project_model text;
  v_model_id uuid;
  v_draft_id uuid;
  v_published_html text;
  v_next integer;
  v_html text := $lf_estrela_html_v1$
<div class="sv-lf-estrela">
<div data-sv-placeholder="COMPANY_LOGO_URL" data-sv-company-logo="true" data-align="center" data-width="108" data-margin-before="0" data-margin-after="2" class="sv-company-logo" style="text-align:center;margin:0px 0 2px;--sv-logo-width:108px">{{COMPANY_LOGO_URL}}</div>
<h1 class="sv-lf-cover-title lf-estrela-title">CAPA RESUMO DO CONTRATO DE PROMESSA DE COMPRA E VENDA</h1>
<p class="sv-lf-green"><strong>CHACREAMENTO: {{PROJECT_NAME}}</strong></p>
<h2 class="sv-lf-section">1. DAS PARTES CONTRATANTES (QUALIFICAÇÃO)<sup>1</sup></h2>
<table class="sv-lf-table sv-lf-table-parties sv-lf-capa lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:17%">Parte</th><th colspan="1" rowspan="1" style="width:32%">Nome/Razão Social</th><th colspan="1" rowspan="1" style="width:25%">Qualidade no Contrato</th><th colspan="1" rowspan="1" style="width:26%">Documento – CNPJ/CPF</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:17%">VENDEDOR (A)</td><td colspan="1" rowspan="1" style="width:32%">{{COMPANY_LEGAL_NAME}}</td><td colspan="1" rowspan="1" style="width:25%">VENDEDOR (A)</td><td colspan="1" rowspan="1" style="width:26%">{{COMPANY_CNPJ}}</td></tr><tr><td colspan="1" rowspan="1" style="width:17%">VENDEDOR (A)</td><td colspan="1" rowspan="1" style="width:32%">{{SELLER_2_NAME}}</td><td colspan="1" rowspan="1" style="width:25%">VENDEDOR (A)</td><td colspan="1" rowspan="1" style="width:26%">{{SELLER_2_CPF_CNPJ}}</td></tr><tr><td colspan="1" rowspan="1" style="width:17%">COMPRADOR (A)</td><td colspan="1" rowspan="1" style="width:32%">{{CLIENT_NAME}}</td><td colspan="1" rowspan="1" style="width:25%">COMPRADOR (A)</td><td colspan="1" rowspan="1" style="width:26%">{{CLIENT_CPF}}</td></tr><tr data-sv-if="spouse"><td colspan="1" rowspan="1" style="width:17%">COMPRADOR (A)</td><td colspan="1" rowspan="1" style="width:32%">{{SPOUSE_NAME}}</td><td colspan="1" rowspan="1" style="width:25%">COMPRADOR (A)</td><td colspan="1" rowspan="1" style="width:26%">{{SPOUSE_CPF}}</td></tr></tbody></table>
<h2 class="sv-lf-section">2. DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)</h2>
<table class="sv-lf-table sv-lf-table-object sv-lf-capa lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:32%">Informação</th><th colspan="1" rowspan="1" style="width:68%">Detalhamento</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:32%">Nome do Projeto</td><td colspan="1" rowspan="1" style="width:68%">{{PROJECT_NAME}}</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Localização do Imóvel</td><td colspan="1" rowspan="1" style="width:68%">{{PROJECT_LOCATION}}</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Área Vendida</td><td colspan="1" rowspan="1" style="width:68%">Chácara: Quadra nº: {{BLOCK_NAME}} – Lote {{LOT_NUMBER}} – Área Total: {{LOT_AREA}} (metros quadrado)</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Confrontações</td><td colspan="1" rowspan="1" style="width:68%">{{LOT_FRONT}} (metros) de frente {{LOT_BACK}} (metros) de fundo {{LOT_RIGHT}} (metros) do lado direito {{LOT_LEFT}} (metros) do lado esquerdo.</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Outras informações</td><td colspan="1" rowspan="1" style="width:68%">{{PARTNERSHIP_NOTE}}</td></tr></tbody></table>
<h2 class="sv-lf-section">3. DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS</h2>
<table class="sv-lf-table sv-lf-table-finance sv-lf-capa lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:43%">ITEM</th><th colspan="1" rowspan="1" style="width:57%">VALOR / DETALHAMENTO</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:43%">VALOR TOTAL DO IMÓVEL</td><td colspan="1" rowspan="1" style="width:57%">{{SALE_VALUE}} ({{SALE_VALUE_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VALOR DE CORRETAGEM</td><td colspan="1" rowspan="1" style="width:57%">{{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VALOR DO SINAL/ENTRADA (ARRAS)<sup>2</sup></td><td colspan="1" rowspan="1" style="width:57%">{{DOWN_PAYMENT}} ({{DOWN_PAYMENT_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">PARCELAS E VALORES<sup>3</sup></td><td colspan="1" rowspan="1" style="width:57%">{{INSTALLMENTS_COUNT}} parcelas de {{INSTALLMENT_VALUE}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VENCIMENTO DAS 1ª PARCELA</td><td colspan="1" rowspan="1" style="width:57%">{{FIRST_DUE_DATE}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">ÍNDICE DE CORREÇÃO ANUAL</td><td colspan="1" rowspan="1" style="width:57%">{{CORRECTION_INDEX}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">MULTA MORATÓRIA POR ATRASO</td><td colspan="1" rowspan="1" style="width:57%">2% (dois por cento) sobre a parcela vencida</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">JUROS DE MORA POR ATRASO</td><td colspan="1" rowspan="1" style="width:57%">1% (um por cento) ao mês</td></tr></tbody></table>
<h2 class="sv-lf-section">4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS<sup>4</sup></h2>
<table class="sv-lf-table sv-lf-capa lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:32%">ITEM</th><th colspan="1" rowspan="1" style="width:68%">Detalhamento</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:32%"></td><td colspan="1" rowspan="1" style="width:68%"></td></tr></tbody></table>
<div class="sv-lf-footnotes"><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>1</sup> É responsabilidade do(a) COMPRADOR(A) informar ao VENDEDOR(A) sobre seu estado civil (casado ou união estável), garantindo a inclusão do cônjuge/companheiro(a) neste contrato e na Escritura Pública, conforme exigência legal.</p><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>2</sup> Natureza jurídica: as ARRAS nos termos dos arts. 417 a 420 do Código Civil – É considerado um valor em dinheiro entregue pela parte compradora ao momento da assinatura de um contrato com objetivo de garantia de cumprimento do negócio e, em outras oportunidades, podendo ser aplicada como indenização pré-fixada.</p><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>3</sup> A comissão de corretagem possui natureza de remuneração pelos serviços de intermediação e não será restituída em caso de distrato, sendo este valor na importância de {{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}}).</p><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>4</sup> Na hipótese de rescisão motivada pelo Comprador, o saldo a ser restituído sofrerá o desconto de: arras, retenção de até 25% do valor pago, corretagem, taxa de fruição, tributos, despesas operacionais, custos de revenda e eventuais multas contratuais.</p></div>
<div data-sv-page-break="true" class="sv-page-break"></div>
<div data-sv-placeholder="COMPANY_LOGO_URL" data-sv-company-logo="true" data-align="center" data-width="108" data-margin-before="0" data-margin-after="2" class="sv-company-logo" style="text-align:center;margin:0px 0 2px;--sv-logo-width:108px">{{COMPANY_LOGO_URL}}</div>
<table class="sv-lf-table sv-lf-table-infra sv-lf-capa lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:43%">ITEM</th><th colspan="1" rowspan="1" style="width:57%">Detalhamento</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:43%">DOCUMENTO DE REFERÊNCIA DA OBRA</td><td colspan="1" rowspan="1" style="width:57%">Planta Topográfica.</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">INFRAESTRUTURA ESSENCIAL</td><td colspan="1" rowspan="1" style="width:57%">Abertura de ruas, Marcação das chácaras, Energia em alta (Rede de Alta Tensão), Poço artesiano coletivo.</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">PRAZO DE ENTREGA DA INFRAESTRUTURA ESSENCIAL</td><td colspan="1" rowspan="1" style="width:57%">Máximo de 12 (doze) meses, contados da data de assinatura do Contrato.</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">INFRAESTRUTURA SECUNDÁRIA (CAIXA D'ÁGUA/MANGUEIRAS)</td><td colspan="1" rowspan="1" style="width:57%">Realização e entrega conforme cronograma, a ser aplicado após findar 12 (doze) meses do início das obras essenciais.</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">CONDIÇÃO DE POSSE AO COMPRADOR</td><td colspan="1" rowspan="1" style="width:57%">Somente após a finalização da Infraestrutura Essencial.</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">DA CONSTRUÇÃO NO LOTE</td><td colspan="1" rowspan="1" style="width:57%">Será permitida somente após o pagamento da 4ª (quarta) parcela do contrato ou com prazo mínimo de 04 (quatro) meses em caso de quitação antecipada.</td></tr></tbody></table>
<p class="sv-lf-date"><strong>{{PROJECT_CITY}}/{{PROJECT_STATE}}, {{CONTRACT_DATE_EXTENSO}}.</strong></p>
<div class="sv-lf-sign lf-estrela-signatures" data-sv-keep-block="true">
<div class="sv-lf-sign-col">
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>COMPRADOR 1</strong></p><p>CPF n° {{CLIENT_CPF}}</p></div>
<div class="sv-lf-sign-slot" data-sv-if="spouse"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>COMPRADOR 2</strong></p><p>CPF n° {{SPOUSE_CPF}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{WITNESS_1_NAME}}</strong></p><p>CPF n°: {{WITNESS_1_CPF}}</p></div>
</div>
<div class="sv-lf-sign-col">
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{COMPANY_LEGAL_NAME}}</strong></p><p>CNPJ {{COMPANY_CNPJ}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{SELLER_2_NAME}}</strong></p><p>CPF n°: {{SELLER_2_CPF_CNPJ}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{WITNESS_2_NAME}}</strong></p><p>CPF n°: {{WITNESS_2_CPF}}</p></div>
</div>
</div>
<div data-sv-page-break="true" class="sv-page-break"></div>
<div data-sv-placeholder="COMPANY_LOGO_URL" data-sv-company-logo="true" data-align="center" data-width="108" data-margin-before="0" data-margin-after="2" class="sv-company-logo" style="text-align:center;margin:0px 0 2px;--sv-logo-width:108px">{{COMPANY_LOGO_URL}}</div>
<h1 class="sv-lf-instrument-title lf-estrela-title">CONTRATO DE PROMESSA<br>DE COMPRA E VENDA</h1>
<p class="sv-lf-subtitle"><em>Instrumento particular de compra e venda de imóvel do tipo chácara rural que se regerá pelas cláusulas e condições a seguir.</em></p>
<p class="sv-lf-body lf-estrela-body">Pelo presente instrumento particular de CONTRATO DE COMPRA E VENDA DE CHÁCARA RURAL, que se regerá pelas cláusulas e condições abaixo descritas, de um lado temos {{CLIENT_NAME}}, {{CLIENT_NATIONALITY}}, {{CLIENT_CIVIL_STATE}}, {{CLIENT_PROFESSION}}, portador(a) do RG sob n° {{CLIENT_RG}} {{CLIENT_RG_ISSUER}} e do CPF sob n° {{CLIENT_CPF}}, residente e domiciliada(o) na {{CLIENT_ADDRESS}}, doravante denominada COMPRADOR/CONTRATANTE e do outro temos a contratada {{COMPANY_LEGAL_NAME}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o n° {{COMPANY_CNPJ}}<span data-sv-if="companyCreci">, CRECI/(PA) n° {{COMPANY_CRECI}}</span>, com sede na {{COMPANY_ADDRESS}}, {{COMPANY_NEIGHBORHOOD}}, {{COMPANY_CITY}}/{{COMPANY_STATE}}, CEP: {{COMPANY_ZIP}}, com o seguinte endereço eletrônico: {{COMPANY_EMAIL}}, Telefone: {{COMPANY_PHONE}}, doravante designada simplesmente como VENDEDOR/CONTRATADA.</p>
<p class="sv-lf-body lf-estrela-body">{{SELLER_2_NAME}}, {{SELLER_2_NATIONALITY}}, {{SELLER_2_CIVIL_STATE}}, {{SELLER_2_PROFESSION}}, Carteira de identidade n° {{SELLER_2_RG}} {{SELLER_2_RG_ISSUER}}, CPF: {{SELLER_2_CPF_CNPJ}}, Residente e domiciliado na: {{SELLER_2_ADDRESS}}, Endereço eletrônico: {{SELLER_2_EMAIL}}. doravante designado simplesmente como VENDEDOR/CONTRATADA.</p>
<p class="sv-lf-body lf-estrela-body">As Partes, de livre e espontânea vontade, resolvem firmar o presente Instrumento Particular de Compra e Venda de Imóvel Rural, cujo objeto consiste na transação do loteamento de terra correspondente à chácara a seguir identificada.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA PRIMEIRA</h2><h3 class="sv-lf-clause-sub">DO OBJETO, DA CAPA RESUMO E DOS ANEXOS</h3>
<p class="sv-lf-body lf-estrela-body"><strong>1.1.</strong> O objeto deste contrato consubstancia-se na compra e venda a prazo da fração de terras individualizada e designada como CHACARA RURAL, componente do PROJETO/CHACREAMENTO {{PROJECT_NAME}}, situado no perímetro rural do Município de {{PROJECT_CITY}}, Estado do {{PROJECT_STATE}}.</p>
<p class="sv-lf-body lf-estrela-body">O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato integra empreendimento rural de natureza privada, comprometendo-se a observar as limitações legais e ambientais inerentes à área rural.</p>
<p class="sv-lf-body lf-estrela-body"><strong>1.2.</strong> A qualificação, confrontações, memorial descritivo e demais dados técnicos da referida unidade imobiliária constam expressamente da CAPA RESUMO e do ANEXO I – Descrição do Imóvel, os quais constituem partes integrantes e complementares deste pacto.</p>
<p class="sv-lf-body lf-estrela-body"><strong>1.3.</strong> A exata delimitação e as medidas perimetrais da chácara negociada são as seguintes:</p>
<table class="sv-lf-table sv-lf-table-object lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:32%">Informação</th><th colspan="1" rowspan="1" style="width:68%">Detalhamento</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:32%">Nome do Projeto</td><td colspan="1" rowspan="1" style="width:68%">{{PROJECT_NAME}}</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Localização do Imóvel</td><td colspan="1" rowspan="1" style="width:68%">{{PROJECT_LOCATION}}</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Área Vendida</td><td colspan="1" rowspan="1" style="width:68%">Chácara: Quadra nº: {{BLOCK_NAME}} – Lote {{LOT_NUMBER}} – Área Total: {{LOT_AREA}} (metros quadrado)</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Confrontações</td><td colspan="1" rowspan="1" style="width:68%">{{LOT_FRONT}} (metros) de frente {{LOT_BACK}} (metros) de fundo {{LOT_RIGHT}} (metros) do lado direito {{LOT_LEFT}} (metros) do lado esquerdo.</td></tr><tr><td colspan="1" rowspan="1" style="width:32%">Outras informações</td><td colspan="1" rowspan="1" style="width:68%">{{PARTNERSHIP_NOTE}}</td></tr></tbody></table>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA SEGUNDA</h2><h3 class="sv-lf-clause-sub">PAGAMENTO, REAJUSTE E MORA</h3>
<p class="sv-lf-body lf-estrela-body"><strong>2.1.</strong> O preço certo e ajustado da unidade imobiliária rural é de:</p>
<table class="sv-lf-table sv-lf-table-finance lf-estrela-table"><thead><tr><th colspan="1" rowspan="1" style="width:43%">ITEM</th><th colspan="1" rowspan="1" style="width:57%">VALOR / DETALHAMENTO</th></tr></thead><tbody><tr><td colspan="1" rowspan="1" style="width:43%">VALOR TOTAL DO IMÓVEL</td><td colspan="1" rowspan="1" style="width:57%">{{SALE_VALUE}} ({{SALE_VALUE_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VALOR DE CORRETAGEM</td><td colspan="1" rowspan="1" style="width:57%">{{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VALOR DO SINAL/ENTRADA (ARRAS)<sup>2</sup></td><td colspan="1" rowspan="1" style="width:57%">{{DOWN_PAYMENT}} ({{DOWN_PAYMENT_EXTENSO}})</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">PARCELAS E VALORES<sup>3</sup></td><td colspan="1" rowspan="1" style="width:57%">{{INSTALLMENTS_COUNT}} parcelas de {{INSTALLMENT_VALUE}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">VENCIMENTO DAS 1ª PARCELA</td><td colspan="1" rowspan="1" style="width:57%">{{FIRST_DUE_DATE}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">ÍNDICE DE CORREÇÃO ANUAL</td><td colspan="1" rowspan="1" style="width:57%">{{CORRECTION_INDEX}}</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">MULTA MORATÓRIA POR ATRASO</td><td colspan="1" rowspan="1" style="width:57%">2% (dois por cento) sobre a parcela vencida</td></tr><tr><td colspan="1" rowspan="1" style="width:43%">JUROS DE MORA POR ATRASO</td><td colspan="1" rowspan="1" style="width:57%">1% (um por cento) ao mês</td></tr></tbody></table>
<p class="sv-lf-body lf-estrela-body"><strong>2.2.</strong> Do Saldo Remanescente: O saldo remanescente do preço ajustado será adimplido pelo COMPRADOR em parcelas mensais e sucessivas, cujos valores, quantidades e datas de vencimento encontram-se rigorosamente especificados na Capa Resumo (ou Anexo correspondente) deste instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.3.</strong> Da Correção Monetária: As parcelas vincendas sofrerão reajuste monetário anual, aplicando-se a variação positiva acumulada do Índice Geral de Preços - Mercado (IGP-M), apurado pela Fundação Getúlio Vargas (FGV). O reajuste incidirá a cada período de 12 (doze) meses, contados a partir da data de assinatura deste contrato (data-base).</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.4.</strong> Na hipótese de extinção, vedação legal ou ausência de divulgação do IGP-M/FGV, adotar-se-á, de imediato, o IPCA/IBGE ou outro índice oficial que venha a substituí-lo, visando a preservação do equilíbrio econômico-financeiro da avença.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.5.</strong> Dos Encargos Moratórios: O impontual pagamento de qualquer das parcelas, ou de seus respectivos reajustes, constituirá o COMPRADOR em mora de pleno direito, independentemente de prévio aviso, interpelação ou notificação, sujeitando o valor em atraso aos seguintes encargos, calculados de forma cumulativa desde a data do vencimento até a data da efetiva liquidação:</p>
<p class="sv-lf-body lf-estrela-body">a) Atualização monetária calculada pro rata die (proporcional aos dias de atraso), com base na variação do IGP-M/FGV;</p>
<p class="sv-lf-body lf-estrela-body">b) Juros de mora de 1% (um por cento) ao mês, calculados pro rata die;</p>
<p class="sv-lf-body lf-estrela-body">c) Multa moratória e irredutível de 2% (dois por cento), incidente sobre o valor total do débito devidamente atualizado.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.6.</strong> Das Arras (Sinal): O valor pago a título de entrada e princípio de pagamento tem caráter de Arras, nos termos dos artigos 417 e seguintes do Código Civil Brasileiro, integrando o preço total do imóvel e sujeitando-se às regras de retenção previstas nas Cláusulas Penais em caso de inexecução do contrato.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.7.</strong> Do Termo de Quitação: Comprovada a liquidação integral do saldo devedor e o fiel cumprimento de todas as obrigações contratuais por parte do COMPRADOR, o VENDEDOR obriga-se a emitir e outorgar o respectivo Termo de Quitação no prazo máximo de 15 (quinze) dias úteis, instrumento este indispensável para a posterior lavratura da Escritura Pública Definitiva.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.8.</strong> Da Comissão de Corretagem: O COMPRADOR declara-se ciente de que o serviço de intermediação imobiliária foi efetivamente prestado, sendo de sua exclusiva responsabilidade o pagamento da comissão de corretagem aos corretores ou imobiliária vinculada, conforme valores e condições discriminados na Capa Resumo deste instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.8.1.</strong> O valor de {{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}}) é destinado exclusivamente à corretagem e não integra o preço do imóvel para fins de quitação junto ao VENDEDOR, tratando-se de obrigação autônoma por serviços de intermediação já concluídos.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.8.2.</strong> Em caso de resolução ou rescisão do presente contrato por culpa do COMPRADOR, o valor pago a título de corretagem não será objeto de restituição, nos termos do Art. 725 do Código Civil.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.9.</strong> Da Rescisão por Inadimplência: Sem prejuízo dos encargos moratórios previstos na cláusula anterior, o atraso no pagamento de qualquer parcela por período superior a 90 (noventa) dias conferirá à VENDEDORA (e/ou Corretora/Imobiliária, se houver poderes de representação) o direito de rescindir o presente contrato de pleno direito.</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.9.1.</strong> A rescisão de que trata este artigo fica condicionada à prévia notificação do COMPRADOR, via cartório de títulos e documentos ou carta com aviso de recebimento (AR), concedendo-lhe o prazo de 15 (quinze) dias para purgação da mora (pagamento do débito atualizado).</p>
<p class="sv-lf-body lf-estrela-body"><strong>2.9.2.</strong> Transcorrido o prazo da notificação sem a devida quitação, a rescisão se consolidará, sujeitando o COMPRADOR às penalidades de retenção de valores previstas nas Cláusulas Penais deste instrumento e na legislação vigente.</p>
<div class="sv-lf-footnotes"><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>5</sup> Natureza jurídica: as ARRAS nos termos dos arts. 417 a 420 do Código Civil – É considerado um valor em dinheiro entregue pela parte compradora ao momento da assinatura de um contrato com objetivo de garantia de cumprimento do negócio e, em outras oportunidades, podendo ser aplicada como indenização pré-fixada.</p><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>6</sup> A comissão de corretagem possui natureza de remuneração pelos serviços de intermediação e não será restituída em caso de distrato, sendo este valor na importância de {{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}}).</p></div>
<div data-sv-page-break="true" class="sv-page-break"></div>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA TERCEIRA</h2><h3 class="sv-lf-clause-sub">DA TRANSMISSÃO DA POSSE DEFINITIVA</h3>
<p class="sv-lf-body lf-estrela-body"><strong>3.1.</strong> A eventual liberação do acesso e uso da chácara ao COMPRADOR (antes da conclusão da infraestrutura), na pendência de pagamento do saldo devedor, configurará posse meramente precária, resolúvel e vinculada ao fiel cumprimento deste instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>3.2.</strong> A referida posse não induzirá, em tempo algum, posse ad usucapionem (para fins de usucapião) e não transferirá a titularidade do bem, a qual permanecerá sob o domínio do VENDEDOR até a efetiva lavratura e registro da Escritura Pública de Compra e Venda, condicionada à quitação total do preço.</p>
<p class="sv-lf-body lf-estrela-body"><strong>3.3.</strong> O COMPRADOR reconhece e declara, de forma irretratável, ter procedido à prévia e minuciosa vistoria física da unidade rural ora transacionada, bem como atesta ter verificado sua inserção no loteamento, sua topografia, demarcação perimetral e marcos divisórios, em cotejo com o memorial descritivo e a planta do empreendimento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>3.4.</strong> Por conseguinte, o COMPRADOR concorda em adquirir o imóvel como coisa certa e discriminada (venda ad corpus, nos termos do art. 500, § 3º, do Código Civil), aceitando-o no exato estado de conservação e fático em que se encontra, renunciando expressamente ao direito de pleitear eventuais abatimentos de preço, indenizações ou a resolução do contrato por vícios aparentes ou eventuais e irrisórias divergências de metragem.</p>
<p class="sv-lf-body lf-estrela-body"><strong>3.5.</strong> Após a quitação integral do preço ora acordado da(s) unidade(s) rurais comercializadas no presente termo e desde que o comprador tenha cumprido todas as suas obrigações previstas neste contrato, será transferida automaticamente ao comprador a posse definitiva, ficando a posse condicionada à finalização das obras de infraestrutura.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA QUARTA</h2><h3 class="sv-lf-clause-sub">DO INÍCIO DA CONSTRUÇÃO PELO COMPRADOR</h3>
<p class="sv-lf-body lf-estrela-body"><strong>4.1.</strong> Das Condições para Edificação e Benfeitorias: A execução de quaisquer obras, edificações ou benfeitorias – sejam elas úteis, necessárias ou voluptuárias – no lote rural objeto deste contrato ficará estritamente condicionada ao cumprimento cumulativo dos seguintes requisitos por parte do COMPRADOR:</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> Comprovar a rigorosa adimplência de todas as obrigações financeiras e contratuais assumidas até a data da solicitação;</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> Obter a prévia e expressa anuência, por escrito, da VENDEDORA;</p>
<p class="sv-lf-body lf-estrela-body"><strong>III.</strong> Ter efetivado, no mínimo, o pagamento integral e tempestivo da 4ª (quarta) parcela do cronograma de pagamento deste instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>4.2.</strong> Da Carência para Início das Obras: Na hipótese de o COMPRADOR optar pela antecipação ou quitação das 4 (quatro) parcelas iniciais antes de seus respectivos vencimentos, ficará, ainda assim, sujeito a um prazo de carência mínima de 04 (quatro) meses, contados a partir da data de assinatura deste contrato, para o início de qualquer intervenção no lote. Ficando assegurado à VENDEDORA o direito de prorrogar referido prazo por igual período, mediante justificativa formalizada ao COMPRADOR.</p>
<p class="sv-lf-body lf-estrela-body"><strong>4.3.</strong> Da Remarcação Topográfica: Caso o COMPRADOR necessite de nova demarcação ou conferência dos marcos divisórios da unidade, deverá apresentar requerimento formal e por escrito à VENDEDORA.</p>
<p class="sv-lf-body lf-estrela-body"><strong>4.4.</strong> O deferimento e a execução do serviço estarão condicionados à irrestrita adimplência contratual do solicitante e ao recolhimento prévio de taxa de serviço (honorários topográficos) equivalente a 1% (um por cento) do valor total e atualizado deste Contrato, pagável mediante boleto bancário emitido especificamente para este fim.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA QUINTA</h2><h3 class="sv-lf-clause-sub">DA EDIFICAÇÃO IRREGULAR E SUAS PENALIDADES</h3>
<p class="sv-lf-body lf-estrela-body"><strong>5.1.</strong> Da Infração: A execução de qualquer obra, edificação, benfeitoria ou supressão de vegetação em desacordo com as condições estipuladas neste contrato (incluindo a ausência de prévia e expressa autorização da VENDEDORA), bem como o desrespeito às normas ambientais, urbanísticas ou aos recuos obrigatórios do lote rural individualizado, configurará infração contratual grave e posse de má-fé por parte do COMPRADOR.</p>
<p class="sv-lf-body lf-estrela-body"><strong>5.2.</strong> Das Sanções e Demolição: Constatada a irregularidade, o COMPRADOR será notificado extrajudicialmente para, no prazo improrrogável de 15 (quinze) dias, paralisar a obra e promover a demolição e o desfazimento das intervenções irregulares, arcando integralmente com os custos de remoção de entulhos e de ações necessárias para a recuperação da área.</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> O descumprimento da notificação sujeitará o COMPRADOR ao pagamento de multa não compensatória equivalente a 10% (dez por cento) do valor atualizado deste contrato, sem prejuízo da rescisão de pleno direito do presente instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> Fica resguardado à VENDEDORA o direito de, a seu exclusivo critério, promover a demolição das obras irregulares às custas do COMPRADOR, cobrando-lhe os valores despendidos com acréscimo de juros e correção monetária.</p>
<p class="sv-lf-body lf-estrela-body"><strong>5.3.</strong> Da Perda das Benfeitorias: Nos termos dos artigos 1.220 e 1.255 do Código Civil, as acessões e benfeitorias introduzidas irregularmente, sem anuência da VENDEDORA ou em violação à lei, não conferirão ao COMPRADOR qualquer direito de retenção ou de indenização, integrando-se ao imóvel em caso de rescisão contratual, se a VENDEDORA não optar por sua demolição.</p>
<p class="sv-lf-body lf-estrela-body"><strong>5.4.</strong> Da Responsabilidade Ambiental: O COMPRADOR assume, de forma exclusiva e irrestrita, a responsabilidade civil, penal e administrativa por eventuais danos ambientais que vier a causar no lote (desmatamento irregular, intervenção em Área de Preservação Permanente - APP, poluição, queimadas e outros), obrigando-se a isentar e ressarcir à VENDEDORA por quaisquer multas, autuações ou embargos aplicados por órgãos públicos (IBAMA, SEMAS/PA, SEMMA, Ministério Público e outros).</p>
<p class="sv-lf-body lf-estrela-body"><strong>5.5.</strong> Considerando a finalidade de lazer e moradia do chacreamento, é terminantemente proibida a instalação de atividade comercial de suinocultura na unidade imobiliária, bem como de qualquer outra atividade que gere odores fétidos, dejetos poluentes ou ruídos que afetem o direito de vizinhança e a salubridade pública. O descumprimento desta vedação sujeitará o infrator à imediata notificação para encerramento da atividade, sob pena de aplicação de multa contratual e responsabilização por eventuais infrações ambientais.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA SEXTA</h2><h3 class="sv-lf-clause-sub">DAS CONSTRUÇÕES COLETIVAS E DE SUA VIABILIDADE</h3>
<p class="sv-lf-body lf-estrela-body"><strong>6.1.</strong> Do Escopo da Infraestrutura: O escopo de responsabilidade da VENDEDORA quanto às obras da área restringe-se, única e exclusivamente, à entrega das seguintes benfeitorias:</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> abertura das vias de acesso interno;</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> demarcação física dos lotes rurais;</p>
<p class="sv-lf-body lf-estrela-body"><strong>III.</strong> implantação de rede primária de energia elétrica; e</p>
<p class="sv-lf-body lf-estrela-body"><strong>IV.</strong> perfuração de poço tubular profundo para captação coletiva de água.</p>
<p class="sv-lf-body lf-estrela-body"><strong>6.2.</strong> Fica o COMPRADOR ciente de que quaisquer outras obras de infraestrutura não elencadas neste rol não são de responsabilidade da VENDEDORA.</p>
<p class="sv-lf-body lf-estrela-body"><strong>6.3.</strong> Da Condição Suspensiva: O cronograma físico de execução das referidas obras sujeita-se a uma condição suspensiva estritamente vinculada ao sucesso comercial do empreendimento. Por conseguinte, As obras de infraestrutura iniciar-se-ão quando atingido o marco comercial mínimo de 30% das unidades comercializadas ou quando houver capitalização suficiente para o início das obras, o que ocorrer primeiro, respeitado o prazo máximo de 06 (seis) meses contados da assinatura deste contrato.</p>
<p class="sv-lf-body lf-estrela-body"><strong>6.4.</strong> O COMPRADOR declara expressa ciência e anuência de que as obras de infraestrutura do empreendimento serão executadas sob o regime de implantação em etapas e que o desenvolvimento do cronograma físico-financeiro e a consequente entrega das benfeitorias ocorrerão de maneira escalonada e estritamente proporcional ao volume de vendas e de capitalização do projeto, sem que tal progressividade ou faseamento configure, por si só, mora automática da VENDEDORA, desde que respeitados os prazos máximos previstos neste contrato.</p>
<p class="sv-lf-body lf-estrela-body"><strong>6.5.</strong> O prazo estimado para conclusão da infraestrutura essencial é de até 120 (cento e vinte) dias, admitida prorrogação por motivo de força maior, caso fortuito, condições climáticas adversas ou exigências administrativas de órgãos públicos.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA SÉTIMA</h2><h3 class="sv-lf-clause-sub">DA RESPONSABILIDADE PELOS TRIBUTOS E ENCARGOS</h3>
<p class="sv-lf-body lf-estrela-body"><strong>7.1.</strong> Dos Encargos Fiscais e Tributários: O COMPRADOR assume, a partir da assinatura do presente contrato, a responsabilidade exclusiva pelo pagamento de todos os tributos federais, estaduais ou municipais (ITR, IPTU, CCIR/INCRA, taxas ambientais e correlatas) incidentes sobre a unidade adquirida, devendo promover a alteração do cadastro de cobrança para o seu nome assim que legalmente autorizado.</p>
<p class="sv-lf-body lf-estrela-body"><strong>7.2.</strong> Caso ainda não exista individualização cadastral da unidade perante os órgãos competentes, o comprador reembolsará à vendedora os tributos incidentes proporcionalmente à área adquirida.</p>
<p class="sv-lf-body lf-estrela-body"><strong>7.3.</strong> Do Reembolso e Infração: Caso a VENDEDORA seja compelida a recolher qualquer tributo ou taxa em atraso para evitar a inscrição em Dívida Ativa ou execuções fiscais, exigirá do COMPRADOR o imediato reembolso do valor pago, acrescido de correção monetária (IGP-M/FGV), juros de 1% ao mês e multa de 2%.</p>
<p class="sv-lf-body lf-estrela-body"><strong>7.4.</strong> Do Prazo para o Reembolso: O não reembolso no prazo de 48 (quarenta e oito) horas, bem como a reincidência na inadimplência tributária, configurarão infração contratual grave, passível de rescisão do presente instrumento.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA OITAVA</h2><h3 class="sv-lf-clause-sub">DA CESSÃO DE DIREITOS E TRANSFERÊNCIA</h3>
<p class="sv-lf-body lf-estrela-body"><strong>8.1.</strong> Da Anuência e Requisitos para a Cessão de Direitos: A cessão, transferência ou alienação dos direitos e obrigações decorrentes deste instrumento a terceiros (Cessionários) somente será admitida mediante o cumprimento estrito e cumulativo dos seguintes requisitos:</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> Estar o COMPRADOR (Cedente) rigorosamente em dia com o pagamento de todas as parcelas, tributos e taxas referentes ao imóvel;</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> Solicitação formal e por escrito apresentada pelo COMPRADOR com antecedência mínima de 30 (trinta) dias;</p>
<p class="sv-lf-body lf-estrela-body"><strong>III.</strong> Aprovação em prévia e rigorosa análise cadastral e de capacidade financeira do pretenso Cessionário, a critério exclusivo da VENDEDORA;</p>
<p class="sv-lf-body lf-estrela-body"><strong>IV.</strong> Emissão de aprovação expressa e formal por parte da VENDEDORA;</p>
<p class="sv-lf-body lf-estrela-body"><strong>V.</strong> Pagamento, à vista, de uma Taxa de Cessão e Anuência fixada no patamar de 5% (cinco por cento) do valor total e atualizado deste contrato, destinada ao custeio de despesas administrativas, jurídicas e de refação de cadastro.</p>
<p class="sv-lf-body lf-estrela-body"><strong>8.2.</strong> Do Direito de Preferência (Preempção): Em caso de intenção de venda, cessão ou transferência da unidade imobiliária, o COMPRADOR deverá oferecer o lote previamente e por escrito à VENDEDORA. Esta terá o direito de preferência para a aquisição do bem nas exatas condições (preço e forma de pagamento) ofertadas a terceiros, devendo exercer seu direito no prazo decadencial de 15 (quinze) dias úteis.</p>
<p class="sv-lf-body lf-estrela-body"><strong>8.3.</strong> Da Exclusividade na Intermediação (Fase de Cessão de Direitos): Não havendo interesse da VENDEDORA no exercício do direito de preferência, e enquanto não houver a quitação integral do preço ajustado neste contrato, a eventual revenda ou cessão de direitos aquisitivos a terceiros deverá, obrigatoriamente, ocorrer por intermédio da própria VENDEDORA ou de imobiliária/corretor por ela expressamente indicado, visando resguardar a segurança da operação e a análise cadastral do novo adquirente.</p>
<p class="sv-lf-body lf-estrela-body"><strong>8.4.</strong> Da Extinção da Exclusividade: Fica expressamente pactuado que a obrigatoriedade de intermediação exclusiva prevista no item 8.2 somente existirá enquanto houver saldo devedor pendente perante a VENDEDORA, a partir do momento de sua quitação, o COMPRADOR estará livre para comercializar o imóvel da forma que melhor lhe convier.</p>
<p class="sv-lf-body lf-estrela-body"><strong>8.5.</strong> Das Penalidades: A cessão, venda ou transferência irregular da unidade à revelia das regras acima estabelecidas implicará na cobrança de multa não compensatória equivalente a 20% (vinte por cento) do valor total e atualizado deste contrato, sem prejuízo da rescisão contratual de pleno direito e da ineficácia do negócio perante a VENDEDORA.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA NONA</h2><h3 class="sv-lf-clause-sub">DA RESOLUÇÃO CONTRATUAL, PENALIDADES E RESTITUIÇÃO DE VALORES</h3>
<p class="sv-lf-body lf-estrela-body"><strong>9.1.</strong> Da Natureza Jurídica das Arras: Fica estabelecido que o valor entregue pelo COMPRADOR no ato da assinatura deste instrumento possui natureza jurídica de Arras Confirmatórias, nos estritos termos dos artigos 417 a 420 do Código Civil. Referida quantia consubstancia a garantia de cumprimento do negócio jurídico entabulado, operando-se, em caso de inexecução culposa ou desistência por parte do COMPRADOR, como indenização pré-fixada em favor da VENDEDORA.</p>
<p class="sv-lf-body lf-estrela-body"><strong>9.2.</strong> Da Comissão de Corretagem: As Partes declaram expressa ciência de que o valor de {{BROKER_COMMISSION}} ({{BROKER_COMMISSION_EXTENSO}}) ostenta a natureza de remuneração pelos serviços de intermediação imobiliária (corretagem) efetivamente prestados. Por se tratar de serviço consumado no ato da assinatura deste instrumento (art. 725 do Código Civil), referida quantia não integrará a base de cálculo para devolução e não será restituída ao COMPRADOR em nenhuma hipótese de distrato ou rescisão motivada por este.</p>
<p class="sv-lf-body lf-estrela-body"><strong>9.3.</strong> Das Penalidades por Rescisão: Operando-se a resolução do presente instrumento por iniciativa, inadimplemento ou culpa exclusiva do COMPRADOR, este sujeitar-se-á, de pleno direito e cumulativamente, às seguintes deduções e penalidades, calculadas sobre o montante atualizado a ser eventualmente restituído:</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> Perda integral da quantia paga a título de Arras/Sinal de Negócio (art. 418 do Código Civil);</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> Retenção de 25% (vinte e cinco por cento) sobre o valor total das parcelas efetivamente pagas, a título de cláusula penal compensatória e indenização pelos custos operacionais, administrativos<sup>7</sup> e de comercialização suportados pela VENDEDORA, em conformidade com os parâmetros da Lei nº 13.786/2018 (Lei do Distrato).</p>
<div class="sv-lf-footnotes"><p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>7</sup> A composição referente à Dedução de Taxa Administrativa de Distrato se encontra fixada em 5% (cinco por cento) sobre o valor total do contrato, destinada à cobertura de despesas operacionais e jurídicas indissociáveis ao cancelamento do negócio e reintegração do imóvel ao estoque da VENDEDORA.</p></div>
<p class="sv-lf-body lf-estrela-body"><strong>9.4.</strong> Da Taxa de Fruição (Ocupação do Imóvel): Em caso de resolução contratual por inadimplemento ou culpa do COMPRADOR, será devida à VENDEDORA uma indenização mensal a título de fruição (taxa de ocupação) do imóvel.</p>
<p class="sv-lf-body lf-estrela-body"><strong>Parágrafo Único:</strong> A referida taxa será calculada à razão de 0,5% (meio por cento) ao mês sobre o valor total e atualizado deste contrato, ou no valor fixo mensal de R$ 500,00 (quinhentos reais), prevalecendo e aplicando-se sempre o que for maior. A taxa incidirá desde a data em que o COMPRADOR teve o lote disponibilizado para seu uso (imissão na posse) até a data da efetiva, comprovada e pacífica desocupação e devolução do bem à VENDEDORA, podendo este montante ser deduzido do saldo a ser restituído.</p>
<p class="sv-lf-body lf-estrela-body"><strong>9.5.</strong> Da Forma e Prazo de Restituição: O saldo remanescente a ser restituído ao COMPRADOR - apurado após sofrer o desconto cumulativo das arras, da retenção de até 25% do valor pago, da comissão de corretagem, da taxa de fruição, dos tributos (IPTU/ITR), das despesas operacionais, dos custos de revenda e de eventuais multas contratuais – será pago somente após a efetiva e incontroversa desocupação e devolução da posse do imóvel à VENDEDORA.</p>
<p class="sv-lf-body lf-estrela-body"><strong>Parágrafo Único:</strong> A restituição ocorrerá em prazo não superior a 12 (doze) meses, contados da data da formalização da rescisão e devolução da posse, ou de forma imediata após a efetiva revenda da unidade a um novo adquirente e o recebimento dos respectivos valores pela VENDEDORA, prevalecendo o evento que ocorrer primeiro.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA DÉCIMA</h2><h3 class="sv-lf-clause-sub">DA RESOLUÇÃO DE LOTE COM EDIFICAÇÕES E BENFEITORIAS</h3>
<p class="sv-lf-body lf-estrela-body"><strong>10.1.</strong> Da Retomada do Imóvel: Na hipótese de rescisão por culpa do COMPRADOR havendo acessões ou benfeitorias introduzidas no lote rural, a VENDEDORA terá assegurado o direito potestativo de retomar a posse imediata do imóvel com todas as suas melhorias, aplicando-se as mesmas regras de retenção financeiras delineadas neste instrumento.</p>
<p class="sv-lf-body lf-estrela-body"><strong>10.2.</strong> Do Direito à Indenização e Retenção: O COMPRADOR fará jus à indenização exclusivamente pelas benfeitorias úteis e necessárias, sendo terminantemente excluídas as voluptuárias. Fica expressamente condicionado que tal indenização somente será devida se as obras tiverem sido edificadas em estrita observância às normas legais, ambientais, municipais e com a prévia aprovação expressa da VENDEDORA, conforme exigido neste contrato.</p>
<p class="sv-lf-body lf-estrela-body"><strong>Parágrafo Único:</strong> O COMPRADOR renuncia expressamente ao direito de retenção do imóvel por benfeitorias (art. 1.219 do Código Civil), obrigando-se a desocupar a chácara imediatamente após a notificação de rescisão, sob pena de caracterização de esbulho possessório, sujeitando-se à reintegração de posse e ao pagamento de taxa de fruição diária.</p>
<p class="sv-lf-body lf-estrela-body"><strong>10.3.</strong> Da Isenção de Responsabilidade da VENDEDORA: Fica expressamente pactuado que a VENDEDORA não se responsabilizará por desembolsar, com recursos próprios, qualquer quantia a título de indenização pelas acessões ou benfeitorias erigidas no lote. O direito ao recebimento de tais valores pelo COMPRADOR ficará estritamente condicionado à efetiva revenda da unidade imobiliária a um terceiro (Novo Adquirente), operando-se a liquidação exclusivamente sob as condições delineadas no parágrafo seguinte.</p>
<p class="sv-lf-body lf-estrela-body"><strong>10.4.</strong> Da Condição e Forma de Repasse pelo Novo Adquirente: O repasse financeiro correspondente à avaliação das benfeitorias úteis e necessárias será suportado pelo Novo Adquirente. O COMPRADOR original declara ciência e concordância de que receberá a referida indenização de forma parcelada, nos exatos prazos, proporções e condições estabelecidos na nova negociação de venda, figurando a VENDEDORA apenas como mandatária, interveniente e facilitadora do repasse dos valores, isenta de qualquer solidariedade ou responsabilidade caso o Novo Adquirente torne-se inadimplente.</p>
<p class="sv-lf-body lf-estrela-body"><strong>10.5.</strong> Da Retenção para Regularização Documental e Tributária: A exigibilidade e a liberação de qualquer saldo indenizatório ao COMPRADOR ficam estritamente subordinadas à comprovação da absoluta regularidade técnica, documental e fiscal da obra.</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> O COMPRADOR deverá apresentar as aprovações de projeto, licenças ambientais, Alvará de Construção, Carta de "Habite-se" (ou equivalente rural) e as Certidões Negativas de Débitos (municipais, estaduais, federais, previdenciários e trabalhistas) vinculadas à edificação.</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> Fica a VENDEDORA irrevogavelmente autorizada a abater e reter do saldo a ser restituído todo e qualquer montante necessário para quitar impostos atrasados, multas, pendências trabalhistas da obra ou taxas de regularização exigidas pelos órgãos públicos, a fim de viabilizar a transferência limpa e desembaraçada ao Novo Adquirente.</p>
<p class="sv-lf-body lf-estrela-body"><strong>10.6.</strong> Das Benfeitorias Voluptuárias: Em obediência ao art. 1.219 do Código Civil, sob nenhuma hipótese haverá indenização ou direito de retenção por benfeitorias voluptuárias (obras de mero luxo, estética ou deleite). Fica facultado ao COMPRADOR, contudo, o direito de levantá-las (retirá-las) às suas exclusivas expensas, desde que tal remoção não acarrete qualquer dano, depreciação ou prejuízo à estrutura do imóvel principal, restabelecendo-o ao seu estado original.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA DÉCIMA PRIMEIRA</h2><h3 class="sv-lf-clause-sub">DO DIREITO DE RECOMPRA, DA FORÇA EXECUTIVA EXTRAJUDICIAL</h3>
<p class="sv-lf-body lf-estrela-body"><strong>11.1.</strong> Da Opção De Recompra e Retomada: Fica assegurado à VENDEDORA, a seu exclusivo critério e conveniência, o direito potestativo de exercer a recompra da unidade imobiliária ou a resolução do contrato com a retomada do bem, nas hipóteses de inadimplência superior a 90 (noventa) dias ou mediante solicitação de distrato por parte do COMPRADOR.</p>
<p class="sv-lf-body lf-estrela-body"><strong>11.2.</strong> O exercício deste direito implicará na aplicação imediata das cláusulas de retenção, multas e taxa de fruição previstas neste instrumento, servindo o presente instrumento como prova contratual para eventual ação de reintegração de posse.</p>
<p class="sv-lf-body lf-estrela-body"><strong>11.3.</strong> Da Força Executiva Extrajudicial: O presente instrumento é firmado sob a égide do artigo 784, inciso III, do Código de Processo Civil, constituindo-se como TÍTULO EXECUTIVO EXTRAJUDICIAL, apto a amparar execução imediata de quantia certa (parcelas vencidas e encargos) ou execução de obrigação de fazer/entregar, independente de prévia ação de conhecimento.</p>
<h2 class="sv-lf-clause lf-estrela-clause-title">CLÁUSULA DÉCIMA SEGUNDA</h2><h3 class="sv-lf-clause-sub">DAS CONDIÇÕES FINAIS E DO FORO DE ELEIÇÃO</h3>
<p class="sv-lf-body lf-estrela-body"><strong>12.1.</strong> O presente contrato é celebrado em caráter irrevogável e irretratável, não admitindo arrependimento unilateral, obrigando as partes contratantes, seus herdeiros e sucessores a qualquer título, ao fiel e integral cumprimento de todas as cláusulas e condições aqui pactuadas.</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.2.</strong> A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais, ou a não aplicação imediata das sanções previstas, será considerada mera liberalidade, não constituindo novação, renúncia de direitos ou alteração das cláusulas aqui pactuadas.</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.3.</strong> As comunicações entre as partes poderão ser realizadas via e-mail, aplicativos de mensagens (whatsapp ou equivalente a ser indicado pelo comprador) ou carta com AR.</p>
<p class="sv-lf-body lf-estrela-body"><strong>Parágrafo único:</strong> O COMPRADOR obriga-se a manter seu endereço e contatos atualizados perante a VENDEDORA, sendo considerada válida e entregue qualquer notificação enviada para o último endereço informado no cadastro.</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.4.</strong> Se qualquer cláusula ou disposição deste contrato for declarada nula ou inexequível por decisão judicial, tal nulidade não afetará as demais cláusulas, as quais permanecerão em pleno vigor e efeito entre as partes.</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.5.</strong> O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato situa-se em área rural/expansão urbana, obrigando-se a respeitar as normas de Direito Ambiental vigentes.</p>
<p class="sv-lf-body lf-estrela-body"><strong>I.</strong> Fica terminantemente proibido qualquer desmatamento, corte de árvores, intervenção em Áreas de Preservação Permanente (APP) ou Reserva Legal sem a prévia e expressa autorização dos órgãos ambientais competentes de ordem municipal, estadual e/ou federal.</p>
<p class="sv-lf-body lf-estrela-body"><strong>II.</strong> O COMPRADOR assume total e exclusiva responsabilidade civil, administrativa e criminal por quaisquer danos ambientais que venha a causar no imóvel, isentando a VENDEDORA de toda e qualquer solidariedade quanto a multas ou embargos aplicados após a imissão na posse.</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.6.</strong> O COMPRADOR autoriza a VENDEDORA a coletar e tratar seus dados pessoais estritamente para fins de gestão contratual, emissão de boletos, cobrança e órgãos de proteção ao crédito, em conformidade com a Lei nº 13.709/2018 (LGPD).</p>
<p class="sv-lf-body lf-estrela-body"><strong>12.7.</strong> Para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato que não puderem ser resolvidas amigavelmente, as partes elegem, com exclusão de qualquer outro por mais privilegiado que seja, o Foro da Comarca de {{PROJECT_FORUM_CITY}}/Estado do {{PROJECT_STATE}}.</p>
<p class="sv-lf-body lf-estrela-body">E por estarem assim justas e contratadas, as partes assinam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de 02 (duas) testemunhas instrumentárias abaixo identificadas.</p>
<p class="sv-lf-date"><strong>{{PROJECT_CITY}}/{{PROJECT_STATE}}, {{CONTRACT_DATE_EXTENSO}}.</strong></p>
<div class="sv-lf-sign lf-estrela-signatures" data-sv-keep-block="true">
<div class="sv-lf-sign-col">
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>COMPRADOR 1</strong></p><p>CPF n° {{CLIENT_CPF}}</p></div>
<div class="sv-lf-sign-slot" data-sv-if="spouse"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>COMPRADOR 2</strong></p><p>CPF n° {{SPOUSE_CPF}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{WITNESS_1_NAME}}</strong></p><p>CPF n°: {{WITNESS_1_CPF}}</p></div>
</div>
<div class="sv-lf-sign-col">
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{COMPANY_LEGAL_NAME}}</strong></p><p>CNPJ {{COMPANY_CNPJ}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{SELLER_2_NAME}}</strong></p><p>CPF n°: {{SELLER_2_CPF_CNPJ}}</p></div>
<div class="sv-lf-sign-slot"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>{{WITNESS_2_NAME}}</strong></p><p>CPF n°: {{WITNESS_2_CPF}}</p></div>
</div>
</div>
</div>
$lf_estrela_html_v1$;
BEGIN
  SELECT c.id
    INTO v_company_id
  FROM public.companies c
  WHERE c.id = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc'::uuid
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id
      INTO v_company_id
    FROM public.companies c
    WHERE c.name ILIKE '%L.F.%'
       OR c.fantasy_name ILIKE '%L.F.%'
       OR c.name ILIKE '%ESTRELA DO SUL%'
       OR c.fantasy_name ILIKE '%ESTRELA DO SUL%'
    ORDER BY c.created_at
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'DEVELOP: company_id da L.F. / Estrela do Sul não encontrado';
  END IF;

  SELECT p.id, p.name, p.contract_model
    INTO v_project_id, v_project_name, v_project_model
  FROM public.projects p
  WHERE p.company_id = v_company_id
    AND p.id = '760c32d8-4c43-403b-986c-9872011f44cd'::uuid
  LIMIT 1;

  IF v_project_id IS NULL THEN
    SELECT p.id, p.name, p.contract_model
      INTO v_project_id, v_project_name, v_project_model
    FROM public.projects p
    WHERE p.company_id = v_company_id
      AND (
        p.name ILIKE 'CHACREAMENTO ESTRELA DO SUL'
        OR p.name ILIKE '%ESTRELA DO SUL%'
      )
    ORDER BY p.created_at
    LIMIT 1;
  END IF;

  IF v_project_id IS NULL OR v_project_name IS NULL OR v_project_name !~* 'estrela' THEN
    RAISE EXCEPTION 'DEVELOP: empreendimento CHACREAMENTO ESTRELA DO SUL não encontrado';
  END IF;

  IF upper(trim(coalesce(v_project_model, ''))) IS DISTINCT FROM 'ESTRELA_DO_SUL' THEN
    RAISE EXCEPTION
      'ABORT: motor do empreendimento não é ESTRELA_DO_SUL (atual=%)',
      v_project_model;
  END IF;

  SELECT m.id
    INTO v_model_id
  FROM public.company_contract_models m
  WHERE m.company_id = v_company_id
    AND upper(btrim(regexp_replace(m.name, '\s+', ' ', 'g'))) = 'LF ESTRELA'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_model_id IS NULL THEN
    INSERT INTO public.company_contract_models (
      company_id,
      tenant_id,
      catalog_code,
      engine_key,
      name,
      status,
      source,
      is_company_default
    ) VALUES (
      v_company_id,
      v_company_id,
      'CUSTOM',
      'custom',
      'LF ESTRELA',
      'active',
      'user',
      false
    )
    RETURNING id INTO v_model_id;
  ELSE
    UPDATE public.company_contract_models
       SET catalog_code = 'CUSTOM',
           engine_key = 'custom',
           name = 'LF ESTRELA',
           status = 'active',
           source = 'user',
           is_company_default = false,
           updated_at = timezone('utc'::text, now())
     WHERE id = v_model_id
       AND company_id = v_company_id
       AND source IS DISTINCT FROM 'system_seed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_contract_models m
    WHERE m.id = v_model_id
      AND m.company_id = v_company_id
      AND m.catalog_code = 'CUSTOM'
      AND m.engine_key = 'custom'
      AND m.status = 'active'
      AND m.source = 'user'
  ) THEN
    RAISE EXCEPTION 'ABORT: modelo LF ESTRELA não ficou CUSTOM/user/active (possível system_seed)';
  END IF;

  SELECT v.id
    INTO v_draft_id
  FROM public.company_contract_model_versions v
  WHERE v.model_id = v_model_id
    AND v.status = 'draft'
    AND v.version = 0
  LIMIT 1;

  IF v_draft_id IS NULL THEN
    INSERT INTO public.company_contract_model_versions (
      model_id,
      company_id,
      version,
      status,
      content_html,
      engine_params_json,
      updated_at
    ) VALUES (
      v_model_id,
      v_company_id,
      0,
      'draft',
      v_html,
      jsonb_build_object(
        'origin', 'LF_ESTRELA_OFFICIAL',
        'published_channel', 'develop',
        'source_commit', 'b346e09'
      ),
      timezone('utc'::text, now())
    );
  ELSE
    UPDATE public.company_contract_model_versions
       SET content_html = v_html,
           engine_params_json = jsonb_build_object(
             'origin', 'LF_ESTRELA_OFFICIAL',
             'published_channel', 'develop',
             'source_commit', 'b346e09'
           ),
           updated_at = timezone('utc'::text, now())
     WHERE id = v_draft_id
       AND model_id = v_model_id
       AND status = 'draft'
       AND version = 0;
  END IF;

  SELECT v.content_html
    INTO v_published_html
  FROM public.company_contract_model_versions v
  WHERE v.model_id = v_model_id
    AND v.status = 'published'
  ORDER BY v.version DESC
  LIMIT 1;

  IF v_published_html IS NULL
     OR v_published_html IS DISTINCT FROM v_html THEN
    SELECT COALESCE(MAX(v.version), 0) + 1
      INTO v_next
    FROM public.company_contract_model_versions v
    WHERE v.model_id = v_model_id
      AND v.status = 'published';

    INSERT INTO public.company_contract_model_versions (
      model_id,
      company_id,
      version,
      status,
      content_html,
      engine_params_json,
      published_at,
      updated_at
    ) VALUES (
      v_model_id,
      v_company_id,
      v_next,
      'published',
      v_html,
      jsonb_build_object(
        'origin', 'LF_ESTRELA_OFFICIAL',
        'published_channel', 'develop',
        'source_commit', 'b346e09'
      ),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;

  INSERT INTO public.project_contract_model_links (
    project_id,
    company_id,
    company_contract_model_id,
    is_project_default
  )
  SELECT v_project_id, v_company_id, v_model_id, false
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.project_contract_model_links l
    WHERE l.project_id = v_project_id
      AND l.company_contract_model_id = v_model_id
  );

  RAISE NOTICE 'LF ESTRELA publicado. company=% project=% model=%',
    v_company_id, v_project_id, v_model_id;
END
$publish_lf_estrela$;

COMMIT;

-- Verificação (rodar após o bloco acima)
SELECT
  m.id AS model_id,
  m.name,
  m.catalog_code,
  m.engine_key,
  m.source,
  m.status,
  v.version AS published_version,
  v.status AS version_status,
  (v.content_html LIKE '%data-sv-if="spouse"%') AS has_spouse_if,
  (v.content_html LIKE '%class="sv-lf-sign %' OR v.content_html LIKE '%class="sv-lf-sign"%') AS has_flex_sign,
  (v.content_html LIKE '%sv-lf-note%') AS has_note_7pt_class,
  (v.content_html LIKE '%sv-a4-flow-gap%' OR v.content_html LIKE '%sv-page-break%') AS has_pagination_markers,
  (v.content_html LIKE '%{{PARTNERSHIP_NOTE}}%') AS has_partnership_note,
  (v.content_html NOT LIKE '%[SEM DADO%') AS template_sem_dado_ausente,
  p.id AS project_id,
  p.name AS project_name,
  p.contract_model AS project_engine,
  l.is_project_default
FROM public.company_contract_models m
JOIN public.company_contract_model_versions v
  ON v.model_id = m.id
 AND v.status = 'published'
LEFT JOIN public.project_contract_model_links l
  ON l.company_contract_model_id = m.id
LEFT JOIN public.projects p
  ON p.id = l.project_id
WHERE m.name = 'LF ESTRELA'
ORDER BY v.version DESC;
