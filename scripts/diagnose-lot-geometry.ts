/**
 * Diagnóstico offline dos lotes de um projeto (Supabase).
 * Uso: npx tsx scripts/diagnose-lot-geometry.ts <projectId>
 */

import { createClient } from '@supabase/supabase-js';
import { runLotGeometryDiagnosticReport } from '../lib/lotGeometryDiagnostic';

const projectId = process.argv[2];
if (!projectId) {
  console.error('Uso: npx tsx scripts/diagnose-lot-geometry.ts <projectId>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const blocks = (data || []) as Record<string, unknown>[];
  runLotGeometryDiagnosticReport(blocks, {
    projectId,
    context: 'cli',
    sampleCount: 10,
  });
}

main();
