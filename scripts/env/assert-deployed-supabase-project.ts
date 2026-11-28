/**
 * Executa a validação central durante o build da Vercel.
 * O next.config compilado não consegue importar TypeScript; este script usa a mesma função do runtime.
 *
 * node .\node_modules\tsx\dist\cli.mjs .\scripts\env\assert-deployed-supabase-project.ts
 */
import { validateSupabaseProject } from '../../lib/security/supabaseProjectGuard';

async function main(): Promise<void> {
  const vercel = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercel !== 'preview' && vercel !== 'production') return;
  const result = await validateSupabaseProject(process.env);
  if (!result.ok) {
    console.error(`[supabase-project] ${result.message}`);
    process.exit(1);
  }
}

void main();
