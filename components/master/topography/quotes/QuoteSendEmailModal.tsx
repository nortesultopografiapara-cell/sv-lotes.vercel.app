'use client';

import { useMemo, useState } from 'react';
import styles from './topographyQuotesEditor.module.css';

type Props = {
  open: boolean;
  quoteCode: string;
  defaultTo: string;
  userId: string;
  quoteId: string;
  onClose: () => void;
};

export default function QuoteSendEmailModal({
  open,
  quoteCode,
  defaultTo,
  userId,
  quoteId,
  onClose,
}: Props) {
  const [to, setTo] = useState(defaultTo || '');
  const [subject, setSubject] = useState(`Orçamento ${quoteCode} — SV Topografia & Projetos`);
  const [message, setMessage] = useState(
    `Prezado(a),\n\nSegue em anexo o orçamento ${quoteCode}.\n\nAtenciosamente,\nSV Topografia & Projetos`,
  );
  const [atts, setAtts] = useState({
    synth: true,
    anal: true,
    memorial: false,
    excel: false,
    csv: false,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSend = useMemo(
    () => Object.values(atts).some(Boolean) && to.trim().includes('@') && subject.trim(),
    [atts, to, subject],
  );

  if (!open) return null;

  const toggle = (key: keyof typeof atts) => {
    setAtts((prev) => ({ ...prev, [key]: !prev[key] }));
    setError(null);
    setOkMsg(null);
  };

  const submit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${quoteId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to: to.trim(),
          subject: subject.trim(),
          message: message.trim(),
          attachments: atts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar.');
      setOkMsg(`Enviado para ${to.trim()} em ${new Date().toLocaleString('pt-BR')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHead}>
          <h3>Enviar orçamento</h3>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            Fechar
          </button>
        </div>

        <label className={styles.field}>
          <span>Destinatário</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} type="email" />
        </label>
        <label className={styles.field}>
          <span>Assunto</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Mensagem</span>
          <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>

        <fieldset className={styles.emailAtts}>
          <legend>Anexos</legend>
          {(
            [
              ['synth', 'PDF Sintético'],
              ['anal', 'PDF Analítico'],
              ['memorial', 'Memória de cálculo (PDF)'],
              ['excel', 'Excel'],
              ['csv', 'CSV'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={styles.scopeOption}>
              <input
                type="checkbox"
                checked={atts[key]}
                onChange={() => toggle(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {error ? <p className={styles.scopeError}>{error}</p> : null}
        {okMsg ? <p className={styles.savedMsg}>{okMsg}</p> : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canSend || sending}
            onClick={() => void submit()}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
