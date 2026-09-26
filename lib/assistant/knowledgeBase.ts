import type { AssistantProcedure } from './types';
import kbIndex from '../../docs/assistant-kb/index.json';
import gisVendaAvista from '../../docs/assistant-kb/gis-venda-avista.json';
import gisVendaParcelada from '../../docs/assistant-kb/gis-venda-parcelada.json';
import gisReserva from '../../docs/assistant-kb/gis-reserva.json';
import customersCadastro from '../../docs/assistant-kb/customers-cadastro.json';
import customersEditar from '../../docs/assistant-kb/customers-editar.json';
import brokersCorretores from '../../docs/assistant-kb/brokers-corretores.json';
import brokersFoto from '../../docs/assistant-kb/brokers-foto.json';
import brokersEditar from '../../docs/assistant-kb/brokers-editar.json';
import contractsGerar from '../../docs/assistant-kb/contracts-gerar.json';
import contractsRegenerar from '../../docs/assistant-kb/contracts-regenerar.json';
import contractsEnviarAssinatura from '../../docs/assistant-kb/contracts-enviar-assinatura.json';
import contractsAssinaturaLf from '../../docs/assistant-kb/contracts-assinatura-lf-imoveis.json';
import contractsAssinaturaMundoNovo from '../../docs/assistant-kb/contracts-assinatura-mundo-novo.json';
import contractsPdfVersoes from '../../docs/assistant-kb/contracts-pdf-versoes.json';
import financeVisaoGeral from '../../docs/assistant-kb/finance-visao-geral.json';
import financeRecibos from '../../docs/assistant-kb/finance-recibos.json';
import financeBaixaManual from '../../docs/assistant-kb/finance-baixa-manual.json';
import financeFluxoCaixa from '../../docs/assistant-kb/finance-fluxo-caixa.json';
import chargesCobrancas from '../../docs/assistant-kb/charges-cobrancas.json';
import chargesWhatsapp from '../../docs/assistant-kb/charges-whatsapp.json';
import chargesLembretes from '../../docs/assistant-kb/charges-lembretes.json';
import gisSplitRecebimentos from '../../docs/assistant-kb/gis-split-recebimentos.json';
import gisConfigEmpreendimento from '../../docs/assistant-kb/gis-config-empreendimento.json';
import gisLotMemorial from '../../docs/assistant-kb/gis-lot-memorial.json';
import gisPranchaGeral from '../../docs/assistant-kb/gis-prancha-geral.json';
import gisPranchaLote from '../../docs/assistant-kb/gis-prancha-lote.json';
import gisConfrontacoes from '../../docs/assistant-kb/gis-confrontacoes.json';
import gisCorrigirFrente from '../../docs/assistant-kb/gis-corrigir-frente.json';
import gisMedirCamadas from '../../docs/assistant-kb/gis-medir-camadas.json';
import gisQuadrasTxt from '../../docs/assistant-kb/gis-quadras-txt.json';
import gisVias from '../../docs/assistant-kb/gis-vias.json';
import settingsEmpresa from '../../docs/assistant-kb/settings-empresa.json';
import ownersSocios from '../../docs/assistant-kb/owners-socios.json';
import billingAssinatura from '../../docs/assistant-kb/billing-assinatura.json';
import offlineSync from '../../docs/assistant-kb/offline-sync.json';
import dashboardExportar from '../../docs/assistant-kb/dashboard-exportar.json';
import dataMigration from '../../docs/assistant-kb/data-migration.json';

const PROCEDURES: AssistantProcedure[] = [
  gisVendaAvista,
  gisVendaParcelada,
  gisReserva,
  customersCadastro,
  customersEditar,
  brokersCorretores,
  brokersFoto,
  brokersEditar,
  contractsGerar,
  contractsRegenerar,
  contractsEnviarAssinatura,
  contractsAssinaturaLf,
  contractsAssinaturaMundoNovo,
  contractsPdfVersoes,
  financeVisaoGeral,
  financeRecibos,
  financeBaixaManual,
  financeFluxoCaixa,
  chargesCobrancas,
  chargesWhatsapp,
  chargesLembretes,
  gisSplitRecebimentos,
  gisConfigEmpreendimento,
  gisLotMemorial,
  gisPranchaGeral,
  gisPranchaLote,
  gisConfrontacoes,
  gisCorrigirFrente,
  gisMedirCamadas,
  gisQuadrasTxt,
  gisVias,
  settingsEmpresa,
  ownersSocios,
  billingAssinatura,
  offlineSync,
  dashboardExportar,
  dataMigration,
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
