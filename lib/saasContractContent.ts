/**
 * Modelo jurídico do Contrato SaaS SV LOTES — texto das cláusulas e qualificação.
 */

import {
  formatSaasCurrency,
  getStandardPlanMonthlyPrice,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import {
  dueDayFromDate,
  subscriptionDatesForContractPdf,
} from '@/lib/companySubscriptionDates';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import { formatDateBr, type CompanySubscription } from '@/lib/saasSubscription';
import { normalizeCompanyContractData } from '@/lib/saasContractValidation';
import {
  formatContractCep,
  formatContractCepRegional,
  formatContractCity,
  formatContractCnpj,
  formatContractPhone,
} from '@/lib/saasContractFormat';

export const MENESES_COMPANY_ID = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

export type SaasContractPdfInput = {
  company: CompanyPricingSource & {
    id?: string;
    name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    subscription_due_day?: number | string | null;
    responsible_name?: string | null;
    legal_representative?: string | null;
    plan?: string | null;
    plan_type?: string | null;
  };
  subscription: Pick<
    CompanySubscription,
    | 'contract_number'
    | 'plan_type'
    | 'monthly_price'
    | 'start_date'
    | 'first_payment_date'
    | 'next_due_date'
  >;
};

export const SAAS_PROVIDER = {
  legalName: 'S.V TOPOGRAFIA E PROJETO LTDA',
  tradeName: 'SV LOTES / SV Topografia & Projetos',
  cnpj: '12.631.238/0001-02',
  address: 'Rua 02, S/N, Quadra 123, Lote 05',
  neighborhood: 'Nova Carajás',
  cep: '68515000',
  city: 'Parauapebas',
  state: 'PA',
  product: 'SV LOTES — Plataforma SaaS de Gestão Imobiliária',
  services: [
    'Plataforma SaaS SV LOTES',
    'Gestão imobiliária e loteamentos',
    'CRM loteadora',
    'Dashboard financeiro',
    'GIS / mapas e memorial descritivo',
    'Contratos automáticos e relatórios',
  ],
};

export function saasProviderCityState(
  provider: Pick<typeof SAAS_PROVIDER, 'city' | 'state'> = SAAS_PROVIDER,
): string {
  return formatContractCity(`${provider.city}/${provider.state}`);
}

export function saasProviderHeadquartersQualification(
  provider: typeof SAAS_PROVIDER = SAAS_PROVIDER,
): string {
  return `com sede na ${provider.address}, Bairro ${provider.neighborhood}, CEP ${formatContractCepRegional(provider.cep)}, Município de ${provider.city}, Estado do Pará`;
}

export type SaasContractSection = {
  number: number;
  /** Ex.: "A" para exibir CLÁUSULA 22-A */
  suffix?: string;
  title: string;
  paragraphs: string[];
};

/** Versão atual do modelo jurídico (assinatura eletrônica integrada). */
export const SAAS_CONTRACT_CONTENT_VERSION = 2;
export const SAAS_CONTRACT_LEGACY_CONTENT_VERSION = 1;

/** Versão do modelo de cláusulas gravada no contrato (legado = 1 quando ausente). */
export function resolveStoredSaasContractContentVersion(
  contract?: { content_version?: number | null } | null,
): number {
  if (!contract) return SAAS_CONTRACT_CONTENT_VERSION;
  return contract.content_version ?? SAAS_CONTRACT_LEGACY_CONTENT_VERSION;
}

function displayField(value: string | null | undefined, fallback = 'Não informado'): string {
  const v = String(value ?? '').trim();
  return v.length > 0 ? v : fallback;
}

export type SaasContractContext = {
  contractNumber: string;
  emissionDate: string;
  provider: typeof SAAS_PROVIDER;
  contractor: {
    name: string;
    cnpj: string;
    responsible: string;
    phone: string;
    email: string;
    address: string;
    cityState: string;
    cep?: string;
  };
  plan: {
    name: string;
    maxProjects: number;
    maxBrokers: number;
    monthlyPrice: string;
    standardPrice: string;
    discount?: string;
    dueDay: number;
    startDate: string;
    firstPaymentDate: string;
    nextDueDate: string;
    cycle: string;
  };
};

export function resolveSaasContractContext(input: SaasContractPdfInput): SaasContractContext {
  const { company: rawCompany, subscription } = input;
  const normalized = normalizeCompanyContractData(rawCompany);
  const company = {
    ...rawCompany,
    address: normalized.address || rawCompany.address,
    city: normalized.city || rawCompany.city,
    state: normalized.state || rawCompany.state,
    email: normalized.email || rawCompany.email,
    phone: normalized.phone || rawCompany.phone,
  };
  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const billingUi = augmentCompanyBilling(company, subscription as CompanySubscription);
  const standardPrice = getStandardPlanMonthlyPrice(company);
  const applied = Number(subscription.monthly_price) || pricing.appliedPrice;
  const billing = subscriptionDatesForContractPdf(subscription);
  const dueDay = dueDayFromDate(billing.start_date);
  const responsible =
    company.legal_representative || company.responsible_name || 'Representante legal';

  return {
    contractNumber: subscription.contract_number || '—',
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    provider: SAAS_PROVIDER,
    contractor: {
      name: displayField(company.name),
      cnpj: formatContractCnpj(displayField(company.cnpj)),
      responsible: displayField(responsible),
      phone: formatContractPhone(displayField(company.phone)),
      email: displayField(company.email),
      address: displayField(normalized.address || company.address),
      cityState: formatContractCity(
        `${displayField(normalized.city || company.city)}/${displayField(normalized.state || company.state)}`,
      ),
      cep: company.cep ? formatContractCep(String(company.cep).trim()) : undefined,
    },
    plan: {
      name: billingUi.ui_plan,
      maxProjects: saas.maxProjects,
      maxBrokers: saas.maxBrokers,
      monthlyPrice: formatSaasCurrency(applied),
      standardPrice: formatSaasCurrency(standardPrice),
      discount:
        pricing.hasCustomPrice && standardPrice > applied
          ? formatSaasCurrency(standardPrice - applied)
          : undefined,
      dueDay,
      startDate: formatDateBr(billing.start_date),
      firstPaymentDate: formatDateBr(billing.first_payment_date),
      nextDueDate: formatDateBr(billing.next_due_date),
      cycle: 'Mensal',
    },
  };
}

export function buildSaasContractSections(
  ctx: SaasContractContext,
  contentVersion: number = SAAS_CONTRACT_CONTENT_VERSION,
): SaasContractSection[] {
  const useElectronicSignatureV2 = contentVersion >= SAAS_CONTRACT_CONTENT_VERSION;
  const p = ctx.provider;
  const c = ctx.contractor;
  const pl = ctx.plan;

  const discountLine = pl.discount
    ? ` Valor padrão do plano: ${pl.standardPrice}. Desconto comercial aplicado: ${pl.discount}.`
    : '';

  const clause12Security = useElectronicSignatureV2
    ? [
        'A CONTRATADA adota medidas técnicas e organizacionais razoáveis de segurança, backup e proteção de dados, compatíveis com a natureza do serviço e com a infraestrutura utilizada (incluindo provedores como Supabase, Vercel e serviços de mapas/APIs).',
        'Os registros de assinatura eletrônica, tokens de autenticação, endereços IP, data e hora, identificação do signatário, histórico de eventos e certificados digitais são armazenados em banco de dados seguro, com preservação do histórico para fins de auditoria, rastreabilidade e comprovação da manifestação de vontade das partes.',
        'A CONTRATANTE reconhece que nenhum sistema é absolutamente imune a falhas. Indisponibilidades causadas por provedores terceiros, internet, ataques externos, manutenção emergencial ou caso fortuito não geram responsabilidade ilimitada da CONTRATADA.',
        'Recomenda-se que a CONTRATANTE mantenha cópias de documentos críticos e revise periodicamente os dados cadastrados. Backups de contingência não substituem a responsabilidade da CONTRATANTE sobre seus registros de negócio.',
      ]
    : [
        'A CONTRATADA adota medidas técnicas e organizacionais razoáveis de segurança, backup e proteção de dados, compatíveis com a natureza do serviço e com a infraestrutura utilizada (incluindo provedores como Supabase, Vercel e serviços de mapas/APIs).',
        'A CONTRATANTE reconhece que nenhum sistema é absolutamente imune a falhas. Indisponibilidades causadas por provedores terceiros, internet, ataques externos, manutenção emergencial ou caso fortuito não geram responsabilidade ilimitada da CONTRATADA.',
        'Recomenda-se que a CONTRATANTE mantenha cópias de documentos críticos e revise periodicamente os dados cadastrados. Backups de contingência não substituem a responsabilidade da CONTRATANTE sobre seus registros de negócio.',
      ];

  const clause21Comms = useElectronicSignatureV2
    ? [
        'As comunicações oficiais entre as partes serão realizadas preferencialmente por e-mail cadastrado, notificações no painel administrativo da plataforma SV LOTES, links individuais de assinatura eletrônica e demais canais informados pela CONTRATADA.',
        'A CONTRATANTE autoriza o recebimento de comunicações contratuais, financeiras e operacionais por e-mail, notificações in-app e, quando informado e consentido, por WhatsApp cadastrado junto à CONTRATADA.',
        'A CONTRATANTE deve manter endereço de e-mail, telefone e WhatsApp de contato atualizados. Comunicações enviadas aos dados cadastrados presumem-se recebidas para fins contratuais, inclusive convites e lembretes de assinatura eletrônica.',
      ]
    : [
        'As comunicações oficiais entre as partes serão realizadas preferencialmente por e-mail cadastrado, notificações no painel administrativo ou outros canais informados pela CONTRATADA.',
        'A CONTRATANTE deve manter endereço de e-mail e telefone de contato atualizados. Comunicações enviadas aos dados cadastrados presumem-se recebidas para fins contratuais.',
      ];

  const clause22Signature = useElectronicSignatureV2
    ? [
        'As partes reconhecem e aceitam a celebração, formalização e execução deste instrumento por meio de assinatura eletrônica disponibilizada pela plataforma SV LOTES, com plena validade jurídica nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, dispensada a assinatura física em papel quando a assinatura eletrônica for concluída pelas partes na plataforma.',
        'O fluxo de assinatura eletrônica utiliza link individual protegido por token de autenticação de uso único e prazo de validade, permitindo ao signatário visualizar o contrato, confirmar seus dados e manifestar concordância com os termos contratuais.',
        'Cada assinatura eletrônica gera registro automático contendo, no mínimo: nome completo e CPF do signatário, e-mail e cargo quando informados, endereço IP, data e hora da assinatura (registro de timestamp), identificação do contrato, histórico de eventos (envio, visualização e assinatura) e hash de integridade do documento (SHA-256) vinculado ao conteúdo assinado.',
        'Ao final do processo bilateral de assinatura, o sistema emite certificado eletrônico de assinatura anexo ao PDF do contrato, consolidando as evidências de autenticidade e integridade do documento.',
        'A CONTRATANTE declara que a assinatura eletrônica realizada por seu representante legal ou procurador devidamente autorizado constitui manifestação válida de vontade, produzindo os mesmos efeitos de documento firmado presencialmente, ressalvadas as hipóteses legais de invalidação.',
      ]
    : [
        'As partes admitem a celebração e formalização deste instrumento por meio de assinatura eletrônica ou digital, nos termos da legislação aplicável, incluindo a Medida Provisória nº 2.200-2/2001 e a Lei nº 14.063/2020, quando disponibilizada pela CONTRATADA.',
        'Até a implementação do fluxo de assinatura eletrônica integrado, a geração do PDF e o aceite comercial constituem manifestação preliminar de vontade, sem prejuízo de formalização posterior por assinatura qualificada ou processo equivalente.',
      ];

  const sections: SaasContractSection[] = [
    {
      number: 1,
      title: 'QUALIFICAÇÃO DAS PARTES',
      paragraphs: [
        `CONTRATADA: ${p.legalName}, nome fantasia ${p.tradeName}, inscrita no CNPJ sob nº ${p.cnpj}, ${saasProviderHeadquartersQualification(p)}, doravante denominada simplesmente CONTRATADA ou FORNECEDORA.`,
        `CONTRATANTE: ${c.name}, inscrita no CNPJ sob nº ${c.cnpj}, representada por ${c.responsible}, com endereço em ${c.address}, ${c.cityState}${c.cep ? `, CEP ${c.cep}` : ''}, telefone ${c.phone}, e-mail ${c.email}, doravante denominada simplesmente CONTRATANTE.`,
        'As partes acima qualificadas celebram o presente Contrato de Licença de Uso de Software na modalidade SaaS (Software as a Service), regido pelas cláusulas e condições a seguir.',
      ],
    },
    {
      number: 2,
      title: 'OBJETO DO CONTRATO',
      paragraphs: [
        `O presente instrumento tem por objeto a concessão de licença de uso, em caráter não exclusivo, intransferível e temporário, da plataforma ${p.product}, desenvolvida e mantida pela CONTRATADA, para gestão de loteamentos, vendas, contratos, financeiro, GIS e demais funcionalidades disponíveis no plano contratado.`,
        'O SV LOTES é licenciado como serviço SaaS (Software as a Service). Não há transferência de propriedade, venda ou cessão do software, código-fonte, banco de dados estrutural ou infraestrutura tecnológica à CONTRATANTE.',
      ],
    },
    {
      number: 3,
      title: 'LICENÇA DE USO SAAS',
      paragraphs: [
        'A CONTRATADA concede à CONTRATANTE licença de uso mensal, revogável e limitada ao plano contratado, mediante pagamento das mensalidades em dia.',
        'A licença autoriza o acesso remoto via internet, por usuários cadastrados e credenciados pela CONTRATANTE, exclusivamente para fins profissionais relacionados à atividade imobiliária e de loteamentos.',
        'É vedado à CONTRATANTE sublicenciar, revender, ceder, alugar, copiar, descompilar, realizar engenharia reversa, extrair o código-fonte ou utilizar o sistema para finalidade diversa da contratada.',
      ],
    },
    {
      number: 4,
      title: 'PLANO CONTRATADO E LIMITES DE USO',
      paragraphs: [
        `Plano contratado: ${pl.name}. Limites comerciais do plano: até ${pl.maxProjects} projeto(s) ativo(s) e até ${pl.maxBrokers} corretor(es) cadastrado(s), salvo upgrade formalizado entre as partes.`,
        'O uso de funcionalidades, módulos e integrações está condicionado ao plano vigente e às políticas técnicas da plataforma. Excedentes ou necessidades superiores aos limites poderão exigir alteração de plano ou contratação adicional.',
        'Credenciais de acesso são pessoais e intransferíveis. A CONTRATANTE é responsável pelo controle de permissões internas e pelo uso realizado por seus usuários.',
      ],
    },
    {
      number: 5,
      title: 'VALOR, VENCIMENTO E FORMA DE PAGAMENTO',
      paragraphs: [
        `Valor mensal contratado: ${pl.monthlyPrice}.${discountLine}`,
        `Ciclo de cobrança: ${pl.cycle}. Dia de vencimento: dia ${pl.dueDay} de cada mês. Data de início da assinatura: ${pl.startDate}. Primeira cobrança: ${pl.firstPaymentDate}. Próximo vencimento previsto: ${pl.nextDueDate}.`,
        'O pagamento deverá ser realizado por meio indicado pela CONTRATADA (boleto, PIX, transferência ou outro canal oficial). Atraso superior a 10 (dez) dias úteis após o vencimento caracteriza inadimplência para os efeitos deste contrato.',
        `Número de referência do contrato SaaS: ${ctx.contractNumber}.`,
      ],
    },
    {
      number: 6,
      title: 'REAJUSTE ANUAL',
      paragraphs: [
        'Os valores poderão ser reajustados anualmente, a cada 12 (doze) meses contados da data de início ou da última alteração contratual, pelo índice IGPM/FGV ou, na sua ausência, por índice oficial que o substitua, limitado ao percentual acumulado do período.',
        'A CONTRATADA comunicará o reajuste com antecedência mínima de 30 (trinta) dias por e-mail ou canal oficial. A continuidade do uso após a vigência do novo valor implica aceitação tácita, salvo manifestação contrária formalizada.',
      ],
    },
    {
      number: 7,
      title: 'SUPORTE TÉCNICO',
      paragraphs: [
        'A CONTRATADA prestará suporte técnico em horário comercial, por canais oficiais (e-mail, sistema de tickets ou WhatsApp corporativo informado), para esclarecimento de dúvidas, orientação de uso e registro de incidentes relacionados à plataforma.',
        'O suporte inclui auxílio na utilização das funcionalidades já disponíveis no plano contratado. Não inclui treinamento presencial ilimitado, consultoria de negócio, customizações ou desenvolvimento de novas funcionalidades, salvo contratação específica.',
        'Prazos de resposta variam conforme criticidade do chamado e volume de demandas. Indisponibilidades decorrentes de manutenção programada serão comunicadas quando possível.',
      ],
    },
    {
      number: 8,
      title: 'ATUALIZAÇÕES E MELHORIAS DO SISTEMA',
      paragraphs: [
        'A CONTRATADA poderá implementar correções, atualizações de segurança, melhorias de interface, novos recursos e ajustes técnicos na plataforma sem necessidade de autorização prévia da CONTRATANTE.',
        'Tais atualizações integram o serviço SaaS e visam manter a estabilidade, conformidade legal e evolução do produto. Alterações que impactem significativamente fluxos de trabalho poderão ser comunicadas por canais oficiais.',
        'A CONTRATANTE reconhece que o modelo SaaS pressupõe evolução contínua do software, sem garantia de manutenção indefinida de telas ou fluxos legados que tenham sido substituídos por versões mais recentes.',
      ],
    },
    {
      number: 9,
      title: 'DESENVOLVIMENTO PERSONALIZADO SOB DEMANDA',
      paragraphs: [
        'Funcionalidades específicas, integrações customizadas, relatórios sob medida, alterações de layout, importações especiais ou qualquer desenvolvimento fora do escopo padrão do plano não estão incluídos na mensalidade.',
        'Solicitações personalizadas serão analisadas pela CONTRATADA, que poderá apresentar orçamento à parte, com prazo, escopo e valor definidos em proposta comercial ou aditivo contratual.',
        'A mensalidade contratada não confere direito a desenvolvimento personalizado ilimitado, nem obriga a CONTRATADA a implementar toda e qualquer demanda apresentada pela CONTRATANTE.',
      ],
    },
    {
      number: 10,
      title: 'RESPONSABILIDADES DA CONTRATANTE',
      paragraphs: [
        'Manter seus dados cadastrais atualizados, efetuar os pagamentos nas datas acordadas e utilizar a plataforma em conformidade com a legislação vigente e com as políticas de uso aceitável.',
        'É de responsabilidade exclusiva da CONTRATANTE a veracidade, legalidade e adequação dos dados, documentos, contratos, mapas, valores e informações inseridos no sistema, inclusive perante clientes finais, corretores e órgãos públicos.',
        'A CONTRATANTE deve zelar pela confidencialidade das credenciais de acesso, adotar boas práticas de segurança interna e notificar a CONTRATADA em caso de uso indevido ou suspeita de comprometimento de contas.',
      ],
    },
    {
      number: 11,
      title: 'RESPONSABILIDADES DA CONTRATADA',
      paragraphs: [
        'Disponibilizar a plataforma SV LOTES conforme o plano contratado, adotar esforços razoáveis de manutenção, correção de falhas e continuidade operacional compatível com serviços SaaS de mercado.',
        'Manter ambiente técnico adequado para operação do sistema, observadas limitações de infraestrutura de terceiros e eventos de força maior.',
        'A CONTRATADA não garante ausência total de interrupções, nem responde por decisões de negócio tomadas pela CONTRATANTE com base em informações lançadas ou extraídas do sistema.',
      ],
    },
    {
      number: 12,
      title: 'SEGURANÇA, BACKUP E DISPONIBILIDADE',
      paragraphs: clause12Security,
    },
    {
      number: 13,
      title: 'LGPD E TRATAMENTO DE DADOS PESSOAIS',
      paragraphs: [
        'As partes comprometem-se a tratar dados pessoais em conformidade com a Lei nº 13.709/2018 (LGPD) e normas correlatas, observando as atribuições de controlador e operador conforme a natureza de cada tratamento.',
        'A CONTRATANTE é controladora dos dados de seus clientes, corretores e demais titulares inseridos na plataforma. A CONTRATADA atua como operadora na medida em que processa tais dados para execução do serviço contratado.',
        'Medidas de segurança, limitação de acesso, registro de operações e atendimento a titulares serão implementadas dentro dos limites técnicos e legais aplicáveis. Incidentes relevantes serão tratados conforme procedimentos internos e exigências legais.',
      ],
    },
    {
      number: 14,
      title: 'CONFIDENCIALIDADE',
      paragraphs: [
        'Informações comerciais, técnicas, financeiras, credenciais, dados de clientes e demais conteúdos acessados em razão deste contrato são confidenciais e não poderão ser divulgados a terceiros sem autorização, salvo por obrigação legal.',
        'A obrigação de confidencialidade permanece vigente durante a execução do contrato e por 2 (dois) anos após seu término, quanto às informações que não sejam de domínio público.',
      ],
    },
    {
      number: 15,
      title: 'PROPRIEDADE INTELECTUAL DO SV LOTES',
      paragraphs: [
        'Todos os direitos de propriedade intelectual sobre o SV LOTES — incluindo código-fonte, layout, banco de dados estrutural, algoritmos, mapas-base do sistema, modelos de relatórios, templates de documentos, marcas e documentação — pertencem exclusivamente à S.V TOPOGRAFIA E PROJETO LTDA.',
        'O presente contrato não transfere qualquer direito de propriedade à CONTRATANTE. Documentos e relatórios gerados a partir de dados inseridos pela CONTRATANTE podem ser utilizados por ela em sua atividade, sem implicar cessão da tecnologia subjacente.',
        'É vedada qualquer reprodução, engenharia reversa ou exploração comercial da plataforma fora dos limites desta licença SaaS.',
      ],
    },
    {
      number: 16,
      title: 'USO ACEITÁVEL DA PLATAFORMA',
      paragraphs: [
        'É proibido utilizar o SV LOTES para fins ilícitos, envio de spam, disseminação de malware, sobrecarga intencional de infraestrutura, violação de direitos de terceiros ou práticas que comprometam a segurança do ambiente.',
        'A CONTRATADA poderá monitorar padrões de uso para proteção do serviço e adotar medidas corretivas, incluindo limitação de acesso, em caso de violação desta cláusula.',
      ],
    },
    {
      number: 17,
      title: 'SUSPENSÃO POR INADIMPLÊNCIA',
      paragraphs: [
        'O atraso no pagamento da mensalidade por prazo superior a 10 (dez) dias úteis autoriza a CONTRATADA a suspender temporariamente o acesso à plataforma, mediante comunicação por e-mail ou canal cadastrado, até a regularização integral dos débitos.',
        'Durante a suspensão, a CONTRATANTE permanece responsável pelas obrigações financeiras vencidas e vincendas conforme o contrato. A reativação ocorrerá após confirmação do pagamento e atualização do status financeiro.',
        'Persistindo a inadimplência por prazo superior a 30 (trinta) dias, a CONTRATADA poderá rescindir o contrato nos termos da cláusula de cancelamento.',
      ],
    },
    {
      number: 18,
      title: 'CANCELAMENTO E ENCERRAMENTO',
      paragraphs: [
        'O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias, por escrito, salvo descumprimento grave que autorize rescisão imediata.',
        'A CONTRATADA poderá encerrar o contrato em caso de inadimplência reiterada, violação de uso aceitável, insolvência da CONTRATANTE ou determinação legal.',
        'O encerramento não exime a CONTRATANTE do pagamento de valores vencidos, nem gera direito a reembolso de mensalidades já pagas referentes a períodos em que o serviço esteve disponível.',
      ],
    },
    {
      number: 19,
      title: 'EXPORTAÇÃO DE DADOS APÓS CANCELAMENTO',
      paragraphs: [
        'Após o cancelamento ou encerramento, a CONTRATANTE poderá solicitar exportação dos dados por ela inseridos no sistema, no formato disponibilizado pela plataforma (relatórios, planilhas ou extrações técnicas compatíveis), dentro do prazo de 30 (trinta) dias contados do encerramento.',
        'Decorrido esse prazo, a CONTRATADA poderá excluir ou anonimizar os dados conforme política de retenção e obrigações legais, sem prejuízo de cópias de segurança temporárias.',
        'A exportação não inclui código-fonte, estrutura interna do banco, templates proprietários ou componentes do SV LOTES.',
      ],
    },
    {
      number: 20,
      title: 'LIMITAÇÃO DE RESPONSABILIDADE',
      paragraphs: [
        'A responsabilidade da CONTRATADA por danos diretos comprovadamente causados por falha exclusiva e comprovada do serviço fica limitada, no agregado, ao valor equivalente a 3 (três) mensalidades vigentes na data do evento.',
        'Em nenhuma hipótese a CONTRATADA responderá por lucros cessantes, danos indiretos, perda de oportunidade, falhas de internet, indisponibilidade de provedores terceiros (incluindo Supabase, Vercel, Google Maps e APIs externas), mau uso do sistema ou dados incorretos inseridos pela CONTRATANTE.',
        'A CONTRATANTE utiliza a plataforma por sua conta e risco quanto às decisões comerciais e jurídicas tomadas com base nas informações processadas.',
      ],
    },
    {
      number: 21,
      title: 'COMUNICAÇÕES OFICIAIS',
      paragraphs: clause21Comms,
    },
    {
      number: 22,
      title: 'ASSINATURA ELETRÔNICA OU DIGITAL',
      paragraphs: clause22Signature,
    },
    {
      number: 23,
      title: 'FORO',
      paragraphs: [
        'Fica eleito o foro da comarca de Parauapebas/PA, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir controvérsias oriundas deste contrato, salvo disposições legais de ordem pública em sentido diverso.',
      ],
    },
    {
      number: 24,
      title: 'DISPOSIÇÕES GERAIS',
      paragraphs: [
        'Este contrato constitui o acordo integral entre as partes quanto ao licenciamento SaaS do SV LOTES, substituindo entendimentos anteriores sobre o mesmo objeto.',
        'A tolerância quanto a eventual descumprimento não implica novação, renúncia ou alteração das cláusulas aqui pactuadas.',
        'Caso qualquer disposição seja considerada inválida, as demais permanecerão em pleno vigor. Alterações somente produzirão efeito se formalizadas por escrito entre as partes ou por aditivo registrado no painel administrativo.',
      ],
    },
  ];

  if (useElectronicSignatureV2) {
    const clause22A: SaasContractSection = {
      number: 22,
      suffix: 'A',
      title: 'EVIDÊNCIAS ELETRÔNICAS',
      paragraphs: [
        'As partes concordam que os registros eletrônicos gerados pela plataforma SV LOTES — incluindo logs de sistema, endereço IP, data e hora (timestamp), token de autenticação do link de assinatura, histórico de visualização do documento, certificado eletrônico de assinatura e hash de integridade (SHA-256) — constituem elementos de prova válidos da manifestação de vontade e da integridade do contrato.',
        'Em caso de disputa, tais evidências poderão ser utilizadas para comprovar a autoria, autenticidade, integridade e cronologia das assinaturas eletrônicas, observada a legislação aplicável e as boas práticas de auditoria digital.',
        'A CONTRATADA compromete-se a preservar o histórico de eventos de assinatura pelo prazo mínimo exigido pela legislação e pelas políticas internas de retenção, ressalvadas exclusões decorrentes de obrigação legal ou encerramento contratual após exportação dos dados pela CONTRATANTE.',
      ],
    };
    const foroIndex = sections.findIndex((s) => s.number === 23);
    sections.splice(foroIndex, 0, clause22A);
  }

  return sections;
}

/** Texto integral do contrato (para testes e busca de cláusulas). */
export function buildSaasContractDocumentText(
  input: SaasContractPdfInput,
  contentVersion: number = SAAS_CONTRACT_CONTENT_VERSION,
): string {
  const ctx = resolveSaasContractContext(input);
  const sections = buildSaasContractSections(ctx, contentVersion);
  const parts: string[] = [
    `CONTRATO DE LICENÇA DE SOFTWARE (SaaS) Nº ${ctx.contractNumber}`,
    `Emitido em ${ctx.emissionDate}`,
    `FORNECEDORA: ${ctx.provider.legalName} — ${ctx.provider.tradeName}`,
    `CONTRATANTE: ${ctx.contractor.name} — CNPJ ${ctx.contractor.cnpj}`,
    `PLANO: ${ctx.plan.name} — ${ctx.plan.monthlyPrice}`,
  ];
  for (const section of sections) {
    const label = section.suffix
      ? `${section.number}-${section.suffix}`
      : String(section.number);
    parts.push(`${label}. ${section.title}`);
    parts.push(...section.paragraphs);
  }
  return parts.join('\n');
}

export function menesesSaasContractFixture(): SaasContractPdfInput {
  return {
    company: {
      id: MENESES_COMPANY_ID,
      name: 'MENESES IMOBILIARIA LTDA',
      cnpj: '64435850000103',
      email: 'contato@meneses.com.br',
      phone: '94992391277',
      address: 'Rua Exemplo, 100',
      city: 'parauapebas',
      state: 'PA',
      cep: '68515000',
      plan: 'business',
      plan_type: 'business',
      subscription_due_day: 27,
      responsible_name: 'Representante Meneses',
    },
    subscription: {
      contract_number: '00003/2026',
      plan_type: 'business',
      monthly_price: 549.99,
      start_date: '2026-05-27',
      first_payment_date: '2026-05-27',
      next_due_date: '2026-06-27',
    } as Pick<
      CompanySubscription,
      | 'contract_number'
      | 'plan_type'
      | 'monthly_price'
      | 'start_date'
      | 'first_payment_date'
      | 'next_due_date'
    >,
  };
}
