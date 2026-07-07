import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shield } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { ClientPortalConfirmForm } from '@/components/portal-cliente/ClientPortalConfirmForm';
import { isClientPortalEnabled, resolveClientPortalUiEnabled } from '@/lib/portal-cliente/config';

export const metadata: Metadata = {
  title: 'Confirmação por WhatsApp | Portal do Cliente',
  description: 'Confirme seu acesso ao Portal do Cliente com o código enviado por WhatsApp.',
  robots: { index: false, follow: false },
};

export default function ClientPortalConfirmPage() {
  if (!isClientPortalEnabled() || !resolveClientPortalUiEnabled()) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <SvLotesLogo href="/" size={40} showText subtitle="Portal do Cliente" />
          <Link
            href="/portal-cliente"
            className="text-xs font-medium text-gray-400 transition hover:text-white"
          >
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col px-6 py-10">
        <div className="mb-8 space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
            <Shield className="h-7 w-7 text-cyan-400" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Confirmação por WhatsApp</h1>
          <p className="text-sm leading-relaxed text-gray-400">
            Informe o código de 6 dígitos enviado para o WhatsApp cadastrado.
          </p>
        </div>

        <div className="rounded-2xl border border-[#2d3340] bg-[#13161c] p-6 shadow-xl">
          <ClientPortalConfirmForm />
        </div>
      </main>
    </div>
  );
}
