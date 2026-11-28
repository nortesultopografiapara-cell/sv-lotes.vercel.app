/**
 * Validação do projeto Supabase do processo atual.
 * Imprime somente identificadores e o resultado. Não imprime chaves.
 *
 * node .\node_modules\tsx\dist\cli.mjs .\scripts\env\validate-supabase-project.ts
 */
import { validateSupabaseProject } from '../../lib/security/supabaseProjectGuard';

async function main(): Promise<void> {
  const result = await validateSupabaseProject(process.env);
  const safe = {
    ok: result.ok,
    executionEnvironment: result.executionEnvironment,
    expectedRef: result.expectedRef,
    publicRef: result.publicRef,
    privateRef: result.privateRef,
    anonFormat: result.anon?.format || null,
    anonRef: result.anon?.ref || null,
    serviceFormat: result.serviceRole?.format || null,
    serviceRef: result.serviceRole?.ref || null,
    probe: result.probe,
    message: result.message,
  };
  console.log(JSON.stringify(safe));
  process.exit(result.ok ? 0 : 1);
}

void main();
