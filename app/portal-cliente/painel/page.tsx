import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { ClientPortalDashboard } from '@/components/portal-cliente/ClientPortalDashboard';
import { isClientPortalEnabled, resolveClientPortalUiEnabled } from '@/lib/portal-cliente/config';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';

export const metadata: Metadata = {
  title: 'Painel | Portal do Cliente',
  description: 'Consulte contrato e parcelas do seu lote — somente leitura.',
  robots: { index: false, follow: false },
};

export default async function ClientPortalPainelPage() {
  if (!isClientPortalEnabled() || !resolveClientPortalUiEnabled()) {
    notFound();
  }

  const cookie = await getClientPortalSessionCookie();
  const session = cookie ? readClientPortalSessionToken(cookie) : null;
  if (!session) {
    redirect('/portal-cliente');
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white">
      <header className="border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <SvLotesLogo href="/portal-cliente" size={36} showText subtitle="Portal do Cliente" />
          <Link
            href="/portal-cliente"
            className="text-xs font-medium text-gray-400 transition hover:text-white"
          >
            Sair
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <ClientPortalDashboard />
      </main>
    </div>
  );
}
