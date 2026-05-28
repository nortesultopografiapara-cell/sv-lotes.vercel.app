'use client';

import Image from 'next/image';
import Link from 'next/link';
import { SV_LOTES_BRAND, SV_LOTES_LOGO_PATH } from '@/lib/brand';

type Props = {
  size?: number;
  showText?: boolean;
  subtitle?: string;
  href?: string;
  className?: string;
  textClassName?: string;
  onClick?: () => void;
};

export function SvLotesLogo({
  size = 36,
  showText = true,
  subtitle,
  href,
  className = '',
  textClassName = '',
  onClick,
}: Props) {
  const inner = (
    <>
      <Image
        src={SV_LOTES_LOGO_PATH}
        alt={SV_LOTES_BRAND.name}
        width={size}
        height={size}
        className="object-contain shrink-0 rounded-lg"
        priority
      />
      {showText && (
        <div className={`min-w-0 ${textClassName}`}>
          <p className="text-sm font-bold text-white tracking-tight truncate leading-tight">
            {SV_LOTES_BRAND.name}
          </p>
          {(subtitle ?? SV_LOTES_BRAND.tagline) && (
            <p className="text-[10px] text-slate-500 font-medium truncate leading-tight">
              {subtitle ?? SV_LOTES_BRAND.tagline}
            </p>
          )}
        </div>
      )}
    </>
  );

  const wrapperClass = `flex items-center gap-2.5 min-w-0 ${className}`;

  if (href) {
    return (
      <Link href={href} className={wrapperClass} onClick={onClick}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={wrapperClass} onClick={onClick} role={onClick ? 'button' : undefined}>
      {inner}
    </div>
  );
}
