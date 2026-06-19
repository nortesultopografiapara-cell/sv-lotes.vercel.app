'use client';

import {
  CheckCircle,
  Wallet,
  ShieldAlert,
  Users,
  PauseCircle,
  FileClock,
} from 'lucide-react';
import { SaasMetricCard } from './SaasPanelUi';

type Props = {
  receivedRevenue: number;
  revenueToReceive: number;
  delinquencyAmount: number;
  activeClients: number;
  suspendedClients: number;
  pendingInvoices: number;
  formatCurrency: (n: number) => string;
};

export function SaasDashboardKpis({
  receivedRevenue,
  revenueToReceive,
  delinquencyAmount,
  activeClients,
  suspendedClients,
  pendingInvoices,
  formatCurrency,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <SaasMetricCard
        title="Receita recebida"
        value={formatCurrency(receivedRevenue)}
        description="Pagamentos confirmados"
        icon={<CheckCircle className="w-5 h-5" />}
        tone="green"
      />
      <SaasMetricCard
        title="Receita a receber"
        value={formatCurrency(revenueToReceive)}
        description="Dentro do prazo"
        icon={<Wallet className="w-5 h-5" />}
        tone="blue"
      />
      <SaasMetricCard
        title="Inadimplência"
        value={formatCurrency(delinquencyAmount)}
        description="Valores vencidos"
        icon={<ShieldAlert className="w-5 h-5" />}
        tone="red"
      />
      <SaasMetricCard
        title="Empresas ativas"
        value={String(activeClients)}
        description="Assinaturas faturáveis"
        icon={<Users className="w-5 h-5" />}
        tone="teal"
      />
      <SaasMetricCard
        title="Empresas suspensas"
        value={String(suspendedClients)}
        description="Acesso bloqueado"
        icon={<PauseCircle className="w-5 h-5" />}
        tone="amber"
      />
      <SaasMetricCard
        title="Faturas pendentes"
        value={String(pendingInvoices)}
        description="Aguardando pagamento"
        icon={<FileClock className="w-5 h-5" />}
        tone="purple"
      />
    </div>
  );
}
