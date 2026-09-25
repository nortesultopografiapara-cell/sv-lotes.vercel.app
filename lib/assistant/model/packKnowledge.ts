import type { AssistantProcedure, AssistantSafeContext } from '../types';
import type { AssistantChatTurn } from '../types';

export function packAssistantKnowledge(procedures: AssistantProcedure[]): string {
  return procedures
    .slice(0, 8)
    .map((procedure) => {
      const models = procedure.modelDifferences
        .map((item) => `${item.models.join('/')}: ${item.note}`)
        .join('\n');
      return [
        `ID: ${procedure.id}`,
        `Título: ${procedure.title}`,
        `Módulo: ${procedure.module}`,
        `Rotas: ${procedure.routes.join(', ')}`,
        `Acesso: ${procedure.access}`,
        `Caminho: ${procedure.navigationPath.join(' → ')}`,
        `Objetivo: ${procedure.objective}`,
        `Passos:\n${procedure.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `Resultado: ${procedure.expectedResult}`,
        models ? `Diferenças por modelo:\n${models}` : '',
        `Limitações:\n${procedure.limitations.map((item) => `- ${item}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

export function packAssistantContext(context: AssistantSafeContext): string {
  return [
    `Rota atual: ${context.pathname}`,
    `Módulo: ${context.moduleId}`,
    `Perfil: ${context.role} (${context.roleLabel})`,
    context.tenantName ? `Empresa: ${context.tenantName}` : null,
    context.projectName ? `Empreendimento: ${context.projectName}` : null,
    context.contractModel ? `Modelo de contrato: ${context.contractModel}` : null,
    `Visão: ${context.viewer}${context.impersonatingTenant ? ' (impersonando tenant)' : ''}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function packHistory(history: AssistantChatTurn[]): string {
  if (history.length === 0) return '(sem histórico)';
  return history.map((item) => `${item.role === 'user' ? 'Usuário' : 'Assistente'}: ${item.text}`).join('\n');
}
