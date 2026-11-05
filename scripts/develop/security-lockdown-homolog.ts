/**
 * Roteiro da homologação coordenada.
 * Para antes de abrir conexão. Não aplica SQL.
 * npx tsx scripts/develop/security-lockdown-homolog.ts
 */
import {
  SECURITY_HOMOLOG_STEPS,
  securityHomologBlockReason,
} from '../../lib/security/securityLockdownHomologPlan';

const reason = securityHomologBlockReason(process.env);
console.log(JSON.stringify({
  executed: false,
  reason: reason || 'AUTHORIZED_BUT_NOT_WIRED',
  writes: 0,
  steps: SECURITY_HOMOLOG_STEPS.map((step) => step.id),
}));

if (!reason) {
  throw new Error('Homologação autorizada ainda não está ligada a um executor de banco.');
}

process.exit(0);
