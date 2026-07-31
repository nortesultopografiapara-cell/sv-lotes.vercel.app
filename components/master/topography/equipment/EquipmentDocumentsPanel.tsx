'use client';

import { useState } from 'react';
import {
  EQUIPMENT_DOCUMENT_TYPES,
  type MasterTopographyEquipmentDocument,
} from '@/lib/master/topography/equipmentDocumentTypes';
import styles from './equipment.module.css';

function formatBytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

type Props = {
  equipmentId: string;
  userId: string;
  documents: MasterTopographyEquipmentDocument[];
  busy: boolean;
  /** Quando true, usa layout compacto (ex.: dentro do modal de edição). */
  embedded?: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string) => void;
};

export function EquipmentDocumentsPanel({
  equipmentId,
  userId,
  documents,
  busy,
  embedded = false,
  onChanged,
  onError,
  onToast,
}: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tipo, setTipo] = useState('OTHER');
  const [titulo, setTitulo] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const upload = async () => {
    if (!equipmentId) {
      setFormError('Salve o equipamento primeiro para anexar documentos.');
      return;
    }
    if (!file) {
      setFormError('Selecione um arquivo.');
      return;
    }
    setUploading(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('tipo', tipo);
      fd.set('titulo', titulo || file.name);
      if (issuedAt) fd.set('issued_at', issuedAt);
      if (validUntil) fd.set('valid_until', validUntil);
      if (notes) fd.set('notes', notes);
      fd.set('file', file);

      const res = await fetch(`/api/master/topography/equipment/${equipmentId}/documents`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no upload.');
      setOpen(false);
      setFile(null);
      setTitulo('');
      setNotes('');
      setIssuedAt('');
      setValidUntil('');
      onToast('Documento anexado.');
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (docId: string) => {
    try {
      const res = await fetch(
        `/api/master/topography/equipment/${equipmentId}/documents/${docId}?userId=${encodeURIComponent(userId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no download.');
      if (data.url) window.open(String(data.url), '_blank', 'noopener,noreferrer');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha no download.');
    }
  };

  const remove = async (docId: string) => {
    if (!window.confirm('Remover este documento?')) return;
    try {
      const res = await fetch(
        `/api/master/topography/equipment/${equipmentId}/documents/${docId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir.');
      onToast('Documento removido.');
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao excluir.');
    }
  };

  return (
    <div className={embedded ? styles.docsPanelEmbedded : styles.card}>
      <div className={styles.panelHeader}>
        <h3>Documentos e arquivos</h3>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={busy || uploading || !equipmentId}
          onClick={() => {
            if (!equipmentId) return;
            setFormError(null);
            setOpen(true);
          }}
        >
          Anexar
        </button>
      </div>

      {documents.length === 0 ? (
        <p className={styles.muted}>Nenhum documento anexado.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Arquivo</th>
                <th>Validade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.titulo}</td>
                  <td>{d.tipo}</td>
                  <td>
                    {d.file_name}
                    <div className={styles.muted}>{formatBytes(d.file_size)}</div>
                  </td>
                  <td>{formatDate(d.valid_until)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => void download(d.id)}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => void remove(d.id)}
                        disabled={busy}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div
          className={`${styles.modalOverlay} ${styles.modalOverlayNested}`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`${styles.modal} ${styles.modalNested}`}>
            <h3>Anexar documento</h3>
            {formError ? <div className={styles.formError}>{formError}</div> : null}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="eq-doc-tipo">Tipo</label>
                <select
                  id="eq-doc-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  {EQUIPMENT_DOCUMENT_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-doc-titulo">Título</label>
                <input
                  id="eq-doc-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Nota fiscal 123"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-doc-issued">Emissão</label>
                <input
                  id="eq-doc-issued"
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-doc-valid">Validade</label>
                <input
                  id="eq-doc-valid"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="eq-doc-file">Arquivo (PDF/JPG/PNG/WEBP, máx. 20 MB)</label>
                <input
                  id="eq-doc-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="eq-doc-notes">Observações</label>
                <textarea
                  id="eq-doc-notes"
                  className={styles.textarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={uploading}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={uploading}
                onClick={() => void upload()}
              >
                {uploading ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
