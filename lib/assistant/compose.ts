import {
  ASSISTANT_FORBIDDEN_BROKER,
  ASSISTANT_FORBIDDEN_WRITE_OWNER,
  ASSISTANT_GUIDANCE_ONLY,
  ASSISTANT_MASTER_DISCLAIMER,
  ASSISTANT_UNKNOWN_ANSWER,
} from './constants';
import type { AssistantAskResult, AssistantProcedure, AssistantSafeContext } from './types';

function formatPath(procedure: AssistantProcedure): string {
  return procedure.navigationPath.join(' → ');
}

function formatProcedure(procedure: AssistantProcedure): string {
  const lines: string[] = [];
  lines.push(procedure.title);
  lines.push('');
  lines.push(procedure.objective);
  lines.push('');
  lines.push(`Caminho: ${formatPath(procedure)}`);
  if (procedure.prerequisites.length > 0) {
    lines.push('');
    lines.push('Pré-requisitos:');
    for (const item of procedure.prerequisites) lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('Passos:');
  procedure.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push('');
  lines.push(`Resultado esperado: ${procedure.expectedResult}`);
  if (procedure.modelDifferences.length > 0) {
    lines.push('');
    lines.push('Diferenças por modelo:');
    for (const diff of procedure.modelDifferences) {
      lines.push(`- ${diff.models.join(', ')}: ${diff.note}`);
    }
  }
  if (procedure.commonErrors.length > 0) {
    lines.push('');
    lines.push('Erros comuns:');
    for (const item of procedure.commonErrors) lines.push(`- ${item}`);
  }
  if (procedure.limitations.length > 0) {
    lines.push('');
    lines.push('Observações:');
    for (const item of procedure.limitations) lines.push(`- ${item}`);
  }
  return lines.join('\n');
}

export function composeAssistantAnswer(input: {
  kind: AssistantAskResult['kind'];
  procedures: AssistantProcedure[];
  context: AssistantSafeContext;
  forbiddenReason?: 'broker' | 'owner-write' | 'profile';
}): AssistantAskResult {
  if (input.kind === 'unknown' || (input.procedures.length === 0 && input.kind !== 'forbidden')) {
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
    };
  }

  if (input.kind === 'forbidden') {
    const text =
      input.forbiddenReason === 'owner-write'
        ? ASSISTANT_FORBIDDEN_WRITE_OWNER
        : input.forbiddenReason === 'broker'
          ? ASSISTANT_FORBIDDEN_BROKER
          : ASSISTANT_UNKNOWN_ANSWER;
    return {
      kind: 'forbidden',
      text,
      procedureIds: [],
      retrievedTitles: [],
    };
  }

  const blocks = input.procedures.map((item) => formatProcedure(item));
  if (input.context.viewer === 'master' && !input.context.impersonatingTenant) {
    blocks.unshift(ASSISTANT_MASTER_DISCLAIMER);
  }
  blocks.push(ASSISTANT_GUIDANCE_ONLY);

  return {
    kind: 'answer',
    text: blocks.join('\n\n'),
    procedureIds: input.procedures.map((item) => item.id),
    retrievedTitles: input.procedures.map((item) => item.title),
  };
}
