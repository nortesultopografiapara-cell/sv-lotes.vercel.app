export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { warmSupabaseProjectGuard } = await import('@/lib/security/supabaseProjectGuard');
  await warmSupabaseProjectGuard();
}
