'use client';

import { useEffect } from 'react';

/**
 * Boundary de erro da rota. Em produção: mensagem amigável apenas.
 * Detalhes técnicos ficam no console, sem PII.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    console.error('[APP_ROUTE_ERROR]', {
      name: error?.name ?? 'Error',
      message: error?.message ? String(error.message).slice(0, 200) : null,
      digest: error?.digest ?? null,
      ...(isDev ? { stack: error?.stack ?? null } : {}),
    });
  }, [error, isDev]);

  return (
    <div className="flex items-center justify-center h-screen w-full bg-[#111111] text-white flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-center">
        Não foi possível concluir esta operação. Tente novamente.
      </h2>
      {isDev && error?.message ? (
        <pre className="max-w-xl w-full text-left text-xs text-red-300/90 bg-black/40 border border-red-500/30 rounded p-3 overflow-auto whitespace-pre-wrap break-words">
          {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20"
      >
        Tentar novamente
      </button>
    </div>
  );
}
