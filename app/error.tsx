'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[APP_ROUTE_ERROR]', error?.message, error?.digest, error);
  }, [error]);

  const isProd =
    String(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || '')
      .trim()
      .toLowerCase() === 'production';

  return (
    <div className="flex items-center justify-center h-screen w-full bg-[#111111] text-white flex-col gap-4 p-6">
      <h2>Something went wrong!</h2>
      {!isProd && error?.message ? (
        <pre className="max-w-xl w-full text-left text-xs text-red-300/90 bg-black/40 border border-red-500/30 rounded p-3 overflow-auto whitespace-pre-wrap break-words">
          {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
        </pre>
      ) : null}
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
