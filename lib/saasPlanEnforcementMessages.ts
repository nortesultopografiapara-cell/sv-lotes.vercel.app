import { formatSaasPlanLimitValue } from '@/lib/saasPlans';

export function formatProjectLimitMessage(limit: number): string {
  const label = limit === 1 ? 'loteamento' : 'loteamentos';
  return `Limite do plano atingido. Este plano permite até ${formatSaasPlanLimitValue(limit)} ${label}. Para adicionar mais loteamentos, solicite alteração do plano no Master.`;
}

export function formatLotsLimitMessage(limit: number, current: number, adding: number): string {
  return `Limite de lotes atingido. Este plano permite até ${formatSaasPlanLimitValue(limit)} lotes no total. Você possui ${formatSaasPlanLimitValue(current)} lotes cadastrados e está tentando adicionar ${formatSaasPlanLimitValue(adding)}.`;
}

export function formatBrokersLimitMessage(limit: number): string {
  return `Limite de corretores atingido. Este plano permite até ${formatSaasPlanLimitValue(limit)} corretores ativos.`;
}

export function formatAdminsLimitMessage(limit: number): string {
  const label = limit === 1 ? 'administrador' : 'administradores';
  return `Limite de administradores atingido. Este plano permite até ${formatSaasPlanLimitValue(limit)} ${label}.`;
}
