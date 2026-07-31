'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OPERATION_DOCUMENT_TYPES,
  operationDocumentTypeLabel,
  type MasterTopographyOperationDocument,
} from '@/lib/master/topography/operationDocumentTypes';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
};

function formatBytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OperationDocumentsPanel({ operationId, userId, active, onToast, onError }: Props) {
  const [documents, setDocuments] = useState<MasterTopographyOperationDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState('OTHER');
  const [titulo, setTitulo] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/documents?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar documentos.');
      setDocuments(data.documents || []);
    } catch (err) {
      setDocuments([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const upload = async () => {
    if (!file) {
      setFormError('Selecione um arquivo.');
      return;
    }
    setUploading(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('type', tipo);
      fd.set('title', titulo.trim() || file.name);
      if (notes.trim()) fd.set('notes', notes.trim());
      fd.set('file', file);

      const res = await fetch(`/api/master/topography/operations/${operationId}/documents`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no upload.');
      setFile(null);
      setTitulo('');
      setNotes('');
      onToast('Documento anexado.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (docId: string) => {
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/documents/${docId}?userId=${encodeURIComponent(userId)}`,
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
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/documents/${docId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover.');
      onToast('Documento removido.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover.');
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Documentos</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando…</p> : null}

      <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
        {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
        <div className={styles.field}>
          <label htmlFor="doc-type">Tipo</label>
          <select id="doc-type" className={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {OPERATION_DOCUMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="doc-title">Título</label>
          <input
            id="doc-title"
            className={styles.input}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Opcional — usa nome do arquivo"
          />
        </div>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="doc-file">Arquivo *</label>
          <input
            id="doc-file"
            type="file"
            className={styles.input}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="doc-notes">Observações</label>
          <textarea
            id="doc-notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className={styles.fieldFull}>
          <button type="button" className={styles.btnPrimary} disabled={uploading} onClick={() => void upload()}>
            {uploading ? 'Enviando…' : 'Anexar documento'}
          </button>
        </div>
      </div>

      {!loading && documents.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Nenhum documento</h2>
          <p>Anexe PDFs, fotos, KML/KMZ e arquivos técnicos da operação.</p>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Tamanho</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className={styles.nameCell}>{doc.title || doc.file_name}</td>
                  <td>{operationDocumentTypeLabel(doc.type)}</td>
                  <td>{formatBytes(doc.file_size)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.btnSecondary} onClick={() => void download(doc.id)}>
                        Abrir
                      </button>
                      <button type="button" className={styles.btnDanger} onClick={() => void remove(doc.id)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
