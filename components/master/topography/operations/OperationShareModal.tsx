'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildOperationShareMessage,
  buildWhatsAppShareUrl,
} from '@/lib/master/topography/operationShare';
import type { MasterTopographyOperation } from '@/lib/master/topography/operationTypes';
import styles from './operation.module.css';

type Props = {
  open: boolean;
  operation: MasterTopographyOperation | null;
  userId: string;
  onClose: () => void;
  onDownloadPdf: () => Promise<void> | void;
};

export function OperationShareModal({
  open,
  operation,
  userId,
  onClose,
  onDownloadPdf,
}: Props) {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !operation) return;
    setMessage(buildOperationShareMessage(operation));
    setCopied(false);
    setMessageCopied(false);
  }, [open, operation]);

  const waUrl = useMemo(() => {
    if (!operation) return null;
    return buildWhatsAppShareUrl(operation.responsible_phone, message);
  }, [operation, message]);

  if (!open || !operation) return null;

  const detailUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/master/topography/operations/${operation.id}`
      : `/master/topography/operations/${operation.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(detailUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setMessageCopied(true);
    } catch {
      setMessageCopied(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownloadPdf();
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = async () => {
    // Baixa PDF primeiro (WhatsApp Web não anexa automaticamente) e abre mensagem.
    await handleDownload();
    if (waUrl) {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ width: 'min(560px, 100%)' }}>
        <div className={styles.modalHeader}>
          <div>
            <h2>Enviar ao colaborador</h2>
            <p>
              {operation.code} — sem envio automático. O PDF é baixado localmente; WhatsApp abre a
              mensagem pronta.
            </p>
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className={styles.modalBody}>
          <dl className={styles.dl}>
            <dt>Responsável</dt>
            <dd>{operation.responsible_name || '—'}</dd>
            <dt>Telefone</dt>
            <dd>{operation.responsible_phone || '—'}</dd>
            <dt>E-mail</dt>
            <dd>{operation.responsible_email || '—'}</dd>
          </dl>

          <div className={styles.field} style={{ marginTop: '0.85rem' }}>
            <label htmlFor="share-msg">Mensagem</label>
            <textarea
              id="share-msg"
              className={styles.textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ minHeight: '6rem' }}
            />
          </div>

          <div className={styles.modalFooter} style={{ flexWrap: 'wrap' }}>
            <button type="button" className={styles.btnSecondary} onClick={() => void handleCopyMessage()}>
              {messageCopied ? 'Mensagem copiada' : 'Copiar mensagem'}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => void handleCopyLink()}>
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => void handleDownload()}
              disabled={downloading || !userId}
            >
              {downloading ? 'Baixando…' : 'Baixar PDF'}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleWhatsApp()}
              disabled={!waUrl || downloading}
              title={
                waUrl
                  ? 'Baixa o PDF e abre o WhatsApp com a mensagem'
                  : 'Informe o telefone do responsável na OS'
              }
            >
              WhatsApp
            </button>
          </div>
          {!waUrl ? (
            <p className={styles.hint}>
              Para WhatsApp, cadastre o telefone do responsável na Ordem de Serviço.
            </p>
          ) : null}
          <p className={styles.hint}>
            E-mail automático não disponível nesta etapa (sem infraestrutura de envio para OS).
          </p>
        </div>
      </div>
    </div>
  );
}
