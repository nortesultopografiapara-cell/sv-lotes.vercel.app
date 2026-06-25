'use client';

import Link from 'next/link';
import { BookOpenText } from 'lucide-react';

const DEFAULT_CLASS =
  'flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors mt-1';

type HelpCenterProfileMenuLinkProps = {
  className?: string;
};

/** Link do menu de perfil — mesma rota do botão premium do header. */
export function HelpCenterProfileMenuLink({
  className = DEFAULT_CLASS,
}: HelpCenterProfileMenuLinkProps) {
  return (
    <Link href="/manual" className={className} aria-label="Central de Ajuda">
      <BookOpenText className="w-4 h-4 shrink-0" aria-hidden />
      Central de Ajuda
    </Link>
  );
}
