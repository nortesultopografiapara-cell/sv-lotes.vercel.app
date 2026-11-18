/**
 * Regularização legada fechada fora do Develop.
 * npx tsx scripts/mandatory-legacy-signal-route-guard-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  isLegacySignalRegularizationRouteEnabled,
  resolveSupabaseProjectRef,
} from '../lib/homolog/env';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function allowedForUrl(url: string | null | undefined) {
  return resolveSupabaseProjectRef(url ?? '') === DEVELOP_PROJECT_REF;
}

assert(allowedForUrl('https://aezktedncttwpqeunjej.supabase.co') === false, 'Production responde fechado');
assert(allowedForUrl('https://hoynysmynxncdlptuzub.supabase.co') === true, 'Develop preserva a rota');
assert(allowedForUrl('https://zumwvcxgrpxggyxomzic.supabase.co') === false, 'clone antigo fica fechado');
assert(allowedForUrl('') === false, 'variável ausente fica fechada');
assert(allowedForUrl(null) === false, 'ambiente desconhecido fica fechado');
assert(allowedForUrl('https://exemplo.supabase.co') === false, 'host estranho fica fechado');
assert(allowedForUrl('SENSITIVE') === false, 'valor mascarado fica fechado');
assert(PRODUCTION_PROJECT_REF !== DEVELOP_PROJECT_REF, 'Production não é Develop');
assert(RETIRED_DEVELOP_PROJECT_REF !== DEVELOP_PROJECT_REF, 'clone antigo não é Develop');
assert(isLegacySignalRegularizationRouteEnabled.length === 0, 'a rota não aceita URL do navegador');

const root = path.resolve(__dirname, '..');
for (const relative of [
  'app/api/finance/legacy-signal-regularization/preview/route.ts',
  'app/api/finance/legacy-signal-regularization/execute/route.ts',
]) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const guardAt = source.indexOf('if (!isLegacySignalRegularizationRouteEnabled())');
  const adminAt = source.indexOf('createAdminSupabase(');
  const authAt = source.indexOf('getRequestAuthUser(');
  assert(guardAt > 0 && adminAt > guardAt && authAt > guardAt, `${relative} fecha antes do cliente e da sessão`);
  assert(source.includes('status: 404'), `${relative} responde 404`);
  assert(source.includes('mutation: false'), `${relative} não grava quando fechada`);
  assert(!source.includes('isLegacySignalRegularizationRouteEnabled(request'), `${relative} não lê o pedido para decidir o ambiente`);
}

const saleEdit = fs.readFileSync(path.join(root, 'lib/saleEdit.ts'), 'utf8');
const regen = fs.readFileSync(path.join(root, 'lib/contractRegeneration.ts'), 'utf8');
assert(!saleEdit.includes('isLegacySignalRegularizationRouteEnabled'), 'a edição da venda permanece igual');
assert(regen.includes('replace_current_contract_version'), 'a regeneração permanece disponível');

console.log('LEGACY_SIGNAL_ROUTE_GUARD_OK');
