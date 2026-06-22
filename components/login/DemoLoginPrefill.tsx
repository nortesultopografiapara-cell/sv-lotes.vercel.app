'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { DEMO_USER_EMAIL } from '@/lib/demoConfig';

type DemoLoginPrefillProps = {
  onDemoMode: (email: string) => void;
};

export function DemoLoginPrefill({ onDemoMode }: DemoLoginPrefillProps) {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  useEffect(() => {
    if (isDemo) {
      onDemoMode(DEMO_USER_EMAIL);
    }
  }, [isDemo, onDemoMode]);

  if (!isDemo) return null;

  return (
    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/25 rounded-lg">
      <div className="flex items-start gap-3">
        <FlaskConical className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-200">Modo demonstração</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
            Use as credenciais exibidas em{' '}
            <a href="/demo" className="text-[var(--color-primary)] hover:underline">
              /demo
            </a>
            . Ambiente isolado com dados fictícios.
          </p>
        </div>
      </div>
    </div>
  );
}
