import type { AssistantCapability } from './types';

/** Fatos estruturados para o modelo. Sem caminhos de arquivo e sem código-fonte. */
export function packAssistantCapabilities(capabilities: AssistantCapability[]): string {
  if (capabilities.length === 0) return '(nenhuma capability recuperada)';
  return capabilities
    .slice(0, 3)
    .map((capability) =>
      [
        `CAPABILITY ${capability.id}`,
        `Título: ${capability.title}`,
        `Módulo: ${capability.module}`,
        `Rotas: ${capability.routes.join(', ')}`,
        `Perfis: ${capability.profiles.join(', ')}`,
        `O que faz: ${capability.summary}`,
        capability.preconditions?.length ? `Pré-condições: ${capability.preconditions.join(' | ')}` : '',
        capability.controls?.length
          ? `Controles: ${capability.controls.map((item) => item.label).join(' · ')}`
          : '',
        capability.sequence?.length ? `Sequência: ${capability.sequence.join(' → ')}` : '',
        capability.fields?.length ? `Campos: ${capability.fields.join(' · ')}` : '',
        capability.validations?.length ? `Validações: ${capability.validations.join(' · ')}` : '',
        capability.conclusion ? `Conclusão: ${capability.conclusion}` : '',
        capability.result ? `Resultado: ${capability.result}` : '',
        capability.restrictions?.length ? `Restrições: ${capability.restrictions.join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n---\n\n');
}

export function packedCapabilityChars(capabilities: AssistantCapability[]): number {
  return packAssistantCapabilities(capabilities).length;
}
