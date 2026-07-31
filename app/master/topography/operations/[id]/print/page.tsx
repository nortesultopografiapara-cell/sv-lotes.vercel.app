'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';

function OperationPrintInner() {
  const { user } = useAuth();
  const params = useParams();
  const id = String(params?.id || '');
  const [message, setMessage] = useState('Preparando impressão da Ordem de Serviço…');

  useEffect(() => {
    if (!user?.id || !id) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/master/topography/operations/${id}/pdf?userId=${encodeURIComponent(user.id)}&disposition=inline`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Falha ao gerar PDF.');
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setMessage('Diálogo de impressão aberto. Você pode fechar esta aba após concluir.');
          } catch {
            window.open(url, '_blank', 'noopener,noreferrer');
            setMessage('PDF aberto em nova aba — use Imprimir do navegador.');
          }
        };
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Falha ao imprimir.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, id]);

  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui', color: '#334155' }}>
      <h1 style={{ fontSize: '1.1rem', marginTop: 0 }}>Impressão — Ordem de Serviço</h1>
      <p style={{ fontSize: '0.875rem' }}>{message}</p>
    </main>
  );
}

export default function MasterTopographyOperationPrintPage() {
  return (
    <MasterSuperAdminGuard>
      <OperationPrintInner />
    </MasterSuperAdminGuard>
  );
}
