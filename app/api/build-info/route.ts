import { NextResponse } from 'next/server';
import { getDeployGitSha, getDeployGitShaShort } from '@/lib/deployGitSha';

export const runtime = 'nodejs';

/** SHA público do Preview — sem dados de sessão. */
export async function GET() {
  const gitSha = getDeployGitSha();
  return NextResponse.json(
    {
      gitSha,
      gitShaShort: getDeployGitShaShort(),
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelUrl: process.env.VERCEL_URL || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-SV-Git-Sha': gitSha,
        'X-SV-Git-Sha-Short': getDeployGitShaShort(),
      },
    },
  );
}
