/**
 * Constantes jurídicas do modelo ESTRELA_DO_SUL.
 * Dados de venda/cadastro NÃO entram aqui — só texto/prazos do instrumento.
 */

export const ESTRELA_DO_SUL_CONTRACT_TITLE =
  'CONTRATO DE PROMESSA DE COMPRA E VENDA';

export const ESTRELA_DO_SUL_COVER_TITLE =
  'CAPA RESUMO DO CONTRATO DE PROMESSA DE COMPRA E VENDA';

export const ESTRELA_DO_SUL_LEGAL_MARKER =
  'CLÁUSULA PRIMEIRA DO OBJETO, DA CAPA RESUMO E DOS ANEXOS';

export const ESTRELA_DO_SUL_PROPERTY_TYPE = 'CHÁCARA RURAL';

/** Multa moratória — cláusula 2.5 / capa. */
export const ESTRELA_LATE_FINE_PERCENT = 2;

/** Juros de mora — cláusula 2.5 / capa. */
export const ESTRELA_LATE_INTEREST_PERCENT = 1;

/** Reajuste anual — cláusula 2.3. */
export const ESTRELA_CORRECTION_INDEX_LABEL =
  'Índice Geral de Preços - Mercado (IGP-M), apurado pela Fundação Getúlio Vargas (FGV)';

export const ESTRELA_CORRECTION_PERIOD_MONTHS = 12;

/** Taxa de cessão — cláusula 8.1.V. */
export const ESTRELA_ASSIGNMENT_FEE_PERCENT = 5;

/** Cessão irregular — cláusula 8.5. */
export const ESTRELA_IRREGULAR_ASSIGNMENT_PENALTY_PERCENT = 20;

/** Edificação irregular — cláusula 5.2.I. */
export const ESTRELA_IRREGULAR_BUILDING_PENALTY_PERCENT = 10;

/** Remarcação topográfica — cláusula 4.4. */
export const ESTRELA_TOPOGRAPHY_FEE_PERCENT = 1;

/** Retenção sobre parcelas pagas — cláusula 9.3.II. */
export const ESTRELA_RESCISSION_RETENTION_PERCENT = 25;

/** Taxa administrativa do distrato (nota 7) — NÃO vem do Split de Recebimentos. */
export const ESTRELA_DISTRACT_ADMIN_FEE_PERCENT = 5;

/** Taxa de fruição — cláusula 9.4. */
export const ESTRELA_OCCUPANCY_FEE_PERCENT = 0.5;
export const ESTRELA_OCCUPANCY_FEE_FLOOR = 500;

/**
 * Narrativa de rateio entre vendedores do instrumento (capa / cláusula 1.3).
 * NÃO lê Split de Recebimentos. Percentuais do documento-fonte — ver divergências.
 */
export const ESTRELA_PARTNERSHIP_FIRST_VENDOR_PERCENT = 40;
export const ESTRELA_PARTNERSHIP_SECOND_VENDOR_PERCENT = 60;

/** Anexo: prazo de infraestrutura essencial. */
export const ESTRELA_ANNEX_ESSENTIAL_INFRA_MONTHS = 12;

/** Anexo: infraestrutura secundária após início das obras essenciais. */
export const ESTRELA_ANNEX_SECONDARY_INFRA_MONTHS = 12;

/** Cláusula 6.5 — prazo distinto do anexo. Ver divergências. */
export const ESTRELA_CLAUSE_6_5_ESSENTIAL_INFRA_DAYS = 120;

/** Cláusula 6.3 — marco comercial mínimo. */
export const ESTRELA_COMMERCIAL_START_PERCENT = 30;
export const ESTRELA_COMMERCIAL_START_MAX_MONTHS = 6;

/** Construção no lote — anexo / cláusula 4.1.III. */
export const ESTRELA_CONSTRUCTION_MIN_INSTALLMENT = 4;
export const ESTRELA_CONSTRUCTION_EARLY_PAYOFF_MONTHS = 4;

export const ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES = [
  {
    id: 'RIO_PARAUAPEBAS',
    excerpt: 'PROJETO/CHACREAMENTO RIO PARAUAPEBAS',
    issue:
      'O instrumento de exemplo cita outro empreendimento. O modelo usa o nome dinâmico de projects.name.',
    status: 'aplicado-dinamico',
  },
  {
    id: 'FINANCE_SAMPLE_SUM',
    excerpt:
      'Valor total R$ 38.500,00 + sinal R$ 2.500,00 + 100×R$ 500,00 no exemplo',
    issue:
      'A soma do exemplo não fecha. Preço, sinal, quantidade e valor das parcelas vêm da venda e de finance_receipts.',
    status: 'aplicado-dinamico',
  },
  {
    id: 'INFRA_DEADLINE',
    excerpt:
      'Anexo: 12 meses para infraestrutura essencial vs cláusula 6.5: 120 dias',
    issue:
      'Conflito material de prazo. Cada trecho foi transcrito como está no documento, sem eleger uma versão.',
    status: 'aguardando-decisao',
  },
  {
    id: 'ITEM_NUMBERING',
    excerpt:
      'Após 12.5 o texto traz itens I/II de APP e em seguida 12.6 e 12.7',
    issue:
      'Numeração duplicada/inconsistente no fecho. Transcrito na ordem do instrumento, sem renumerar.',
    status: 'transcrito-como-no-fonte',
  },
  {
    id: 'PARTNERSHIP_40_60',
    excerpt:
      'Outras informações: 40% ao primeiro vendedor e 60% ao segundo, via boleto',
    issue:
      'Texto do instrumento, não do Split de Recebimentos. Incluído só se houver segundo vendedor cadastrado; percentuais permanecem os do documento até decisão humana.',
    status: 'aguardando-decisao',
  },
  {
    id: 'LGPD_CITATION',
    excerpt: 'Lei nº 13.700/2018 (LGPD) na cláusula 12.6 do fonte',
    issue:
      'A LGPD vigente é a Lei 13.709/2018. O número do fonte foi transcrito sem correção jurídica.',
    status: 'transcrito-como-no-fonte',
  },
  {
    id: 'CLAUSE_8_4_CROSSREF',
    excerpt: 'Cláusula 8.4 remete ao item 8.2 para exclusividade, cujo texto está no 8.3',
    issue: 'Remissão interna inconsistente. Transcrita como no instrumento.',
    status: 'transcrito-como-no-fonte',
  },
  {
    id: 'CLAUSE_2_14_15',
    excerpt: 'Itens 2.14 e 2.15 soltos no documento-fonte',
    issue:
      'A cláusula 2 transcrita encerra em 2.9.2 + notas 5 e 6. Não há parágrafos 2.10–2.15 no instrumento. Números soltos, se visíveis no Word, não têm texto jurídico correspondente — não inventar itens.',
    status: 'aguardando-decisao',
  },
  {
    id: 'COMPANY_CRECI',
    excerpt: 'CRECI(PA) nº 1233 no preâmbulo do exemplo',
    issue:
      'Não há campo CRECI na empresa. O trecho só aparece se companies.creci (ou equivalente) estiver preenchido.',
    status: 'aplicado-dinamico',
  },
] as const;

export const ESTRELA_ANNEX_ROWS = [
  {
    item: 'DOCUMENTO DE REFERÊNCIA DA OBRA',
    detail: 'Planta Topográfica.',
  },
  {
    item: 'INFRAESTRUTURA ESSENCIAL',
    detail:
      'Abertura de ruas, Marcação das chácaras, Energia em alta (Rede de Alta Tensão), Poço artesiano coletivo.',
  },
  {
    item: 'PRAZO DE ENTREGA DA INFRAESTRUTURA ESSENCIAL',
    detail: `Máximo de ${ESTRELA_ANNEX_ESSENTIAL_INFRA_MONTHS} (doze) meses, contados da data da assinatura do Contrato.`,
  },
  {
    item: 'INFRAESTRUTURA SECUNDÁRIA (CAIXA D’ÁGUA/MANGUEIRAS)',
    detail: `Realização e entrega conforme cronograma, a ser aplicado após findar ${ESTRELA_ANNEX_SECONDARY_INFRA_MONTHS} (doze) meses do início das obras essenciais.`,
  },
  {
    item: 'CONDIÇÃO DE POSSE AO COMPRADOR',
    detail: 'Somente após a finalização da Infraestrutura Essencial.',
  },
  {
    item: 'DA CONSTRUÇÃO NO LOTE',
    detail: `Será permitida somente após o pagamento da ${ESTRELA_CONSTRUCTION_MIN_INSTALLMENT}ª (quarta) parcela do contrato ou com prazo mínimo de ${ESTRELA_CONSTRUCTION_EARLY_PAYOFF_MONTHS} (quatro) meses em caso de quitação antecipada.`,
  },
] as const;
