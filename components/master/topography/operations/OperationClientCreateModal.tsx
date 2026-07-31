'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MasterTopographyClient } from '@/lib/master/topography/clientTypes';
import styles from './operation.module.css';

type Props = {
  open: boolean;
  userId: string;
  saving: boolean;
  onClose: () => void;
  onCreated: (client: MasterTopographyClient) => void;
};

export function OperationClientCreateModal({
  open,
  userId,
  saving: externalSaving,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingHint, setExistingHint] = useState<MasterTopographyClient | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDocument('');
    setPhone('');
    setEmail('');
    setContactName('');
    setAddress('');
    setError(null);
    setExistingHint(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setExistingHint(null);
    try {
      const res = await fetch('/api/master/topography/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name,
          document,
          phone,
          email,
          contact_name: contactName,
          address,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.existingClient) {
        setExistingHint(data.existingClient);
        setError(data.error || 'Cliente já cadastrado.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Falha ao cadastrar.');
      onCreated(data.client);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || externalSaving;

  return (
    <div className={`${styles.modalOverlay} ${styles.modalOverlayNested}`} role="dialog" aria-modal="true">
      <div className={`${styles.modal} ${styles.modalNested}`} style={{ width: 'min(520px, 100%)' }}>
        <div className={styles.modalHeader}>
          <div>
            <h2>Cadastrar novo cliente</h2>
            <p>Cadastro Master Topografia — evita duplicidade por CPF/CNPJ.</p>
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
        <form className={styles.modalBody} onSubmit={(e) => void handleSubmit(e)}>
          {error ? <div className={styles.formError}>{error}</div> : null}
          {existingHint ? (
            <div className={styles.infoBanner}>
              Cliente encontrado: <strong>{existingHint.name}</strong>
              {' · '}
              {existingHint.document || 'sem documento'}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => {
                    onCreated(existingHint);
                    onClose();
                  }}
                >
                  Selecionar este cliente
                </button>
              </div>
            </div>
          ) : null}
          <div className={styles.formGrid}>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="new-client-name">Nome *</label>
              <input
                id="new-client-name"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-client-doc">CPF/CNPJ</label>
              <input
                id="new-client-doc"
                className={styles.input}
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="Somente números ou formatado"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-client-phone">Telefone</label>
              <input
                id="new-client-phone"
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-client-email">E-mail</label>
              <input
                id="new-client-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-client-contact">Contato</label>
              <input
                id="new-client-contact"
                className={styles.input}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="new-client-addr">Endereço</label>
              <input
                id="new-client-addr"
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !name.trim()}>
              {busy ? 'Salvando…' : 'Cadastrar e selecionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
