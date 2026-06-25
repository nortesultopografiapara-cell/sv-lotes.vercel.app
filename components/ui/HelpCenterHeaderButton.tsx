'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenText } from 'lucide-react';
import {
  HELP_CENTER_SHOW_PROMO_BADGE,
  HELP_CENTER_TOOLTIP_DESCRIPTION,
  HELP_CENTER_TOOLTIP_TITLE,
} from '@/lib/helpCenterUi';

type HelpCenterHeaderButtonProps = {
  variant: 'desktop' | 'mobile';
};

export function HelpCenterHeaderButton({ variant }: HelpCenterHeaderButtonProps) {
  const pathname = usePathname();
  const isActive = pathname === '/manual';

  return (
    <div className="relative group shrink-0">
      <Link
        href="/manual"
        className={[
          'sv-help-center-btn',
          variant === 'mobile' ? 'sv-help-center-btn--mobile' : '',
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Central de Ajuda"
      >
        <BookOpenText className="w-4 h-4 shrink-0 text-white" aria-hidden />
        {variant === 'desktop' ? (
          <span className="whitespace-nowrap">Central de Ajuda</span>
        ) : (
          <span className="whitespace-nowrap text-[11px] leading-none">📚 Ajuda</span>
        )}
        {HELP_CENTER_SHOW_PROMO_BADGE ? (
          <span className="sv-help-center-btn__badge" aria-hidden>
            ✨
          </span>
        ) : null}
      </Link>

      {variant === 'desktop' ? (
        <div className="sv-help-center-tooltip" role="tooltip">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {HELP_CENTER_TOOLTIP_TITLE}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
            {HELP_CENTER_TOOLTIP_DESCRIPTION}
          </p>
        </div>
      ) : null}
    </div>
  );
}
