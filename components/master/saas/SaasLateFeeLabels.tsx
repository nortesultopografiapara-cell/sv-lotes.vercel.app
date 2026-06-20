'use client';

import {
  formatSaasLateFeeFineLabel,
  formatSaasLateFeeInterestLabel,
  isSaasChargeOpenForLateFeeDisplay,
} from '@/lib/saasLateFeeConfig';

type Props = {
  status?: string | null;
  finePercent?: number | null;
  interestPercent?: number | null;
  className?: string;
  compact?: boolean;
};

export function SaasLateFeeLabels({
  status,
  finePercent,
  interestPercent,
  className = '',
  compact = false,
}: Props) {
  if (!isSaasChargeOpenForLateFeeDisplay(status)) return null;

  return (
    <div className={`space-y-0.5 ${className}`}>
      <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-amber-400/90`}>
        {formatSaasLateFeeFineLabel(finePercent)}
      </p>
      <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-amber-400/80`}>
        {formatSaasLateFeeInterestLabel(interestPercent)}
      </p>
    </div>
  );
}
