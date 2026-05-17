export function generateContractText({
  company_name,
  company_cnpj,
  comprador_nome,
  comprador_cpf,
  comprador_estado_civil,
  comprador_endereco,
  lote_numero,
  lote_quadra,
  lote_area,
  conf_norte,
  conf_sul,
  projeto_nome,
  valor_total,
  valor_entrada,
  data_entrada,
  qtd_parcelas,
  valor_parcela,
  primeiro_vencimento
}: any) {
  return `INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA

1. QUADRO RESUMO - VENDEDORA (PROMITENTE)
Razão Social: ${company_name || '_____________'} 
CNPJ: ${company_cnpj || '_____________'}

2. PROMITENTE COMPRADOR
Nome: ${comprador_nome || '_____________'}
CPF: ${comprador_cpf || '_____________'}
Estado Civil: ${comprador_estado_civil || '_____________'}
Endereço: ${comprador_endereco || '_____________'}

3. OBJETO DO CONTRATO
O presente contrato tem como objeto o Lote número ${lote_numero || '___'}, da Quadra ${lote_quadra || '___'}, medindo ${lote_area || '___'} m², confrontando ao Norte com ${conf_norte || '_____________'}, ao Sul com ${conf_sul || '_____________'}. Loteamento denominado ${projeto_nome || '_____________'}.

4. PREÇO E FORMA DE PAGAMENTO
Valor Total: R$ ${valor_total || '0,00'}
Entrada/Sinal: R$ ${valor_entrada || '0,00'} paga em ${data_entrada || '___/___/_____'}
Saldo: Dividido em ${qtd_parcelas || '___'} prestações mensais de R$ ${valor_parcela || '0,00'}, vencendo a primeira em ${primeiro_vencimento || '___/___/_____'}.

5. CLÁUSULA PRIMEIRA - DA INFRAESTRUTURA E POSSE
A VENDEDORA se compromete a entregar a infraestrutura básica do loteamento nos moldes aprovados pelos órgãos competentes. A posse precária do imóvel será transferida ao COMPRADOR no ato da assinatura deste instrumento, condicionada à regularidade dos pagamentos.

6. CLÁUSULA SEGUNDA - DA RESCISÃO POR INADIMPLEMENTO
O atraso no pagamento de 03 (três) ou mais parcelas consecutivas ou alternadas caracterizará mora do COMPRADOR, sujeitando este contrato à rescisão legal, devendo o COMPRADOR ser notificado previamente para purgação da mora em 30 (trinta) dias.

7. CLÁUSULA TERCEIRA - DO FORO DA COMARCA LOCAL
As partes elegem o foro da Comarca local da situação do imóvel para dirimir quaisquer dúvidas ou litígios decorrentes deste instrumento, renunciando a qualquer outro por mais privilegiado que seja.

E, por estarem justos e contratados, assinam o presente em 02 (duas) vias de igual teor.

Localidade e Data: ___________________, ______ / ______ / ________

_____________________________________________
VENDEDORA
${company_name || ''}

_____________________________________________
COMPRADOR
${comprador_nome || ''}
`;
}
