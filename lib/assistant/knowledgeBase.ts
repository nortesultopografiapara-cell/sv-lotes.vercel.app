import type { AssistantProcedure } from './types';
import kbIndex from '../../docs/assistant-kb/index.json';
import gisVendaAvista from '../../docs/assistant-kb/gis-venda-avista.json';
import gisVendaParcelada from '../../docs/assistant-kb/gis-venda-parcelada.json';
import gisReserva from '../../docs/assistant-kb/gis-reserva.json';
import customersCadastro from '../../docs/assistant-kb/customers-cadastro.json';
import brokersCorretores from '../../docs/assistant-kb/brokers-corretores.json';
import contractsGerar from '../../docs/assistant-kb/contracts-gerar.json';
import contractsRegenerar from '../../docs/assistant-kb/contracts-regenerar.json';
import contractsEnviarAssinatura from '../../docs/assistant-kb/contracts-enviar-assinatura.json';
import contractsAssinaturaLf from '../../docs/assistant-kb/contracts-assinatura-lf-imoveis.json';
import contractsAssinaturaMundoNovo from '../../docs/assistant-kb/contracts-assinatura-mundo-novo.json';
import financeVisaoGeral from '../../docs/assistant-kb/finance-visao-geral.json';
import financeRecibos from '../../docs/assistant-kb/finance-recibos.json';
import chargesCobrancas from '../../docs/assistant-kb/charges-cobrancas.json';
import chargesWhatsapp from '../../docs/assistant-kb/charges-whatsapp.json';
import gisSplitRecebimentos from '../../docs/assistant-kb/gis-split-recebimentos.json';
import gisConfigEmpreendimento from '../../docs/assistant-kb/gis-config-empreendimento.json';

const PROCEDURES: AssistantProcedure[] = [
  gisVendaAvista,
  gisVendaParcelada,
  gisReserva,
  customersCadastro,
  brokersCorretores,
  contractsGerar,
  contractsRegenerar,
  contractsEnviarAssinatura,
  contractsAssinaturaLf,
  contractsAssinaturaMundoNovo,
  financeVisaoGeral,
  financeRecibos,
  chargesCobrancas,
  chargesWhatsapp,
  gisSplitRecebimentos,
  gisConfigEmpreendimento,
] as AssistantProcedure[];

const BY_ID = new Map(PROCEDURES.map((item) => [item.id, item]));

export function getAssistantKbIndex() {
  return kbIndex;
}

export function listAssistantProcedures(): AssistantProcedure[] {
  return PROCEDURES.slice();
}

export function getAssistantProcedureById(id: string): AssistantProcedure | null {
  return BY_ID.get(id) ?? null;
}
