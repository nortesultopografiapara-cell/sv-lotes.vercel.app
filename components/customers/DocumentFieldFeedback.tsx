'use client';

import type { DocumentValidationTone } from '@/lib/inputMasks';

type Props = {
  message?: string;
  tone?: DocumentValidationTone;
  lookupMessage?: string;
};

export function DocumentFieldFeedback({
  message,
  tone = 'none',
  lookupMessage,
}: Props) {
  if (!message && !lookupMessage) return null;

  const color =
    tone === 'error'
      ? 'text-red-600'
      : tone === 'success'
        ? 'text-emerald-600'
        : 'text-slate-500';

  return (
    <div className="mt-1 space-y-0.5">
      {message ? (
        <p className={`text-xs font-medium ${color}`}>{message}</p>
      ) : null}
      {lookupMessage ? (
        <p className="text-xs text-slate-500">{lookupMessage}</p>
      ) : null}
    </div>
  );
}

export function documentFieldInputClass(
  baseClass: string,
  tone: DocumentValidationTone,
): string {
  if (tone === 'error') {
    return `${baseClass} border-red-500 focus:border-red-500 focus:ring-red-200`;
  }
  if (tone === 'success') {
    return `${baseClass} border-emerald-500 focus:border-emerald-500 focus:ring-emerald-200`;
  }
  return baseClass;
}
