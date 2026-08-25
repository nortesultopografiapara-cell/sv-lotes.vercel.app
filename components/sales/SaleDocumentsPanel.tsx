'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FilePlus2,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  formatFileSizeBytes,
  isSaleOperationGeneratedType,
  isUploadAllowedForCategory,
  parseSaleOperationDocumentNumber,
  SALE_DOCUMENT_CATEGORIES,
  SALE_DOCUMENT_CATEGORY_LABELS,
  SALE_DOCUMENT_MAX_BYTES,
  SALE_DOCUMENT_TYPES_BY_CATEGORY,
  SALE_DOCUMENT_TYPE_LABELS,
  saleOperationDocumentStatusLabel,
  terminationDocumentPdfHref,
  terminationDocumentViewHref,
  type SaleDocumentCategory,
} from '@/lib/saleDocuments';
import type { SaleDocumentView } from '@/lib/saleDocumentService';

type SaleDocumentsPanelProps = {
  saleId: string | null | undefined;
  disabled?: boolean;
};

const ACCEPT =
  'application/pdf,image/jpeg,image/jpg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

export function SaleDocumentsPanel({ saleId, disabled }: SaleDocumentsPanelProps) {
  const [documents, setDocuments] = useState<SaleDocumentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<SaleDocumentCategory | null>(
    null,
  );
  const [selectedTypes, setSelectedTypes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const cat of SALE_DOCUMENT_CATEGORIES) {
      initial[cat] = SALE_DOCUMENT_TYPES_BY_CATEGORY[cat][0] || 'OTHER';
    }
    return initial;
  });
  const fileInputRefs = useRef<Partial<Record<SaleDocumentCategory, HTMLInputElement | null>>>(
    {},
  );

  const loadDocuments = useCallback(async () => {
    if (!saleId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}/documents`, {
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Erro ao carregar documentos.',
        );
      }
      setDocuments((payload.documents as SaleDocumentView[]) || []);
    } catch (err) {
      setDocuments([]);
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const byCategory = useMemo(() => {
    const map = new Map<SaleDocumentCategory, SaleDocumentView[]>();
    for (const cat of SALE_DOCUMENT_CATEGORIES) {
      map.set(cat, []);
    }
    for (const doc of documents) {
      const list = map.get(doc.category) || [];
      list.push(doc);
      map.set(doc.category, list);
    }
    return map;
  }, [documents]);

  const operationDocs = useMemo(
    () =>
      documents.filter(
        (doc) =>
          doc.category === 'SYSTEM_GENERATED' &&
          isSaleOperationGeneratedType(doc.document_type),
      ),
    [documents],
  );

  const openTerminationDocument = (download: boolean) => {
    if (!saleId) return;
    const href = download
      ? terminationDocumentPdfHref(saleId)
      : terminationDocumentViewHref(saleId);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const openSignedUrl = async (doc: SaleDocumentView, download: boolean) => {
    if (!saleId) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/documents/${encodeURIComponent(doc.id)}/url`,
        { credentials: 'include' },
      );
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Não foi possível abrir o arquivo.',
        );
      }
      const url = String(payload.url || '');
      if (!url) throw new Error('URL inválida.');
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.original_file_name || 'documento';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir arquivo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleEditDescription = async (doc: SaleDocumentView) => {
    if (!saleId) return;
    const next = window.prompt('Descrição do documento:', doc.description || '');
    if (next === null) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/documents/${encodeURIComponent(doc.id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: next }),
        },
      );
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Erro ao atualizar descrição.',
        );
      }
      await loadDocuments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar descrição.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: SaleDocumentView) => {
    if (!saleId) return;
    if (!window.confirm(`Excluir "${doc.original_file_name}"?`)) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/documents/${encodeURIComponent(doc.id)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Erro ao excluir documento.',
        );
      }
      await loadDocuments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir documento.');
    } finally {
      setBusyId(null);
    }
  };

  const handleFilesSelected = async (
    category: SaleDocumentCategory,
    fileList: FileList | null,
  ) => {
    if (!saleId || !fileList || fileList.length === 0) return;
    const documentType = selectedTypes[category] || 'OTHER';
    const files = Array.from(fileList);
    setUploadingCategory(category);
    setError(null);
    try {
      for (const file of files) {
        if (file.size > SALE_DOCUMENT_MAX_BYTES) {
          throw new Error(
            `"${file.name}" excede o limite de ${Math.round(SALE_DOCUMENT_MAX_BYTES / (1024 * 1024))} MB.`,
          );
        }

        const prepareRes = await fetch(
          `/api/sales/${encodeURIComponent(saleId)}/documents/prepare-upload`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category,
              document_type: documentType,
              original_file_name: file.name,
              mime_type: file.type,
              file_size: file.size,
            }),
          },
        );
        const prepare = await prepareRes.json().catch(() => ({} as Record<string, unknown>));
        if (!prepareRes.ok) {
          throw new Error(
            (typeof prepare.error === 'string' && prepare.error) ||
              `Falha ao preparar upload de ${file.name}.`,
          );
        }

        const bucket = String(prepare.bucket || '');
        const storagePath = String(prepare.storage_path || '');
        const mimeType = String(prepare.mime_type || file.type || 'application/octet-stream');
        if (!bucket || !storagePath) {
          throw new Error('Resposta de prepare-upload incompleta.');
        }

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storagePath, file, {
            upsert: false,
            contentType: mimeType,
          });
        if (uploadError) {
          throw new Error(
            `Falha ao enviar "${file.name}": ${uploadError.message}`,
          );
        }

        const metaRes = await fetch(
          `/api/sales/${encodeURIComponent(saleId)}/documents`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category,
              document_type: documentType,
              original_file_name: file.name,
              storage_path: storagePath,
              mime_type: mimeType,
              file_size: file.size,
            }),
          },
        );
        const meta = await metaRes.json().catch(() => ({} as Record<string, unknown>));
        if (!metaRes.ok) {
          await supabase.storage.from(bucket).remove([storagePath]).catch(() => undefined);
          throw new Error(
            (typeof meta.error === 'string' && meta.error) ||
              `Falha ao registrar "${file.name}".`,
          );
        }
      }
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload.');
    } finally {
      setUploadingCategory(null);
      const input = fileInputRefs.current[category];
      if (input) input.value = '';
    }
  };

  if (!saleId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Salve a venda para anexar documentos. Os arquivos ficam vinculados à venda,
        ao empreendimento e à empresa (multiempresa).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        PDF, JPG, JPEG, PNG ou WEBP. Até{' '}
        {Math.round(SALE_DOCUMENT_MAX_BYTES / (1024 * 1024))} MB por arquivo. Upload
        múltiplo permitido.
      </p>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando documentos…
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
        <div className="mb-3">
          <h4 className="text-sm font-bold text-gray-900">
            Documentos de Encerramento / Operações
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Termos gerados na venda original. O PDF é o mesmo registro de
            sale_documents, sem cópia.
          </p>
        </div>
        {operationDocs.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhum documento de encerramento nesta venda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-1.5 font-semibold">Número</th>
                  <th className="px-2 py-1.5 font-semibold">Tipo</th>
                  <th className="px-2 py-1.5 font-semibold">Data</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {operationDocs.map((doc) => {
                  const busy = busyId === doc.id;
                  const number =
                    parseSaleOperationDocumentNumber(doc) || '—';
                  const isDesistencia =
                    String(doc.document_type || '').toUpperCase() === 'DESISTENCIA';
                  return (
                    <tr key={doc.id} className="border-b border-gray-100 bg-white">
                      <td className="px-2 py-1.5 font-semibold text-gray-900 whitespace-nowrap">
                        {number}
                      </td>
                      <td className="px-2 py-1.5">{doc.document_type_label}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatUploadDate(doc.created_at)}
                      </td>
                      <td className="px-2 py-1.5">
                        {saleOperationDocumentStatusLabel(doc.document_type)}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Visualizar"
                            disabled={busy || disabled}
                            onClick={() =>
                              isDesistencia
                                ? openTerminationDocument(false)
                                : void openSignedUrl(doc, false)
                            }
                            className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Baixar PDF"
                            disabled={busy || disabled}
                            onClick={() =>
                              isDesistencia
                                ? openTerminationDocument(true)
                                : void openSignedUrl(doc, true)
                            }
                            className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {SALE_DOCUMENT_CATEGORIES.map((category) => {
        const rawDocs = byCategory.get(category) || [];
        const docs =
          category === 'SYSTEM_GENERATED'
            ? rawDocs.filter((doc) => !isSaleOperationGeneratedType(doc.document_type))
            : rawDocs;
        const canUpload = isUploadAllowedForCategory(category) && !disabled;
        const types = SALE_DOCUMENT_TYPES_BY_CATEGORY[category];
        const uploading = uploadingCategory === category;

        return (
          <section
            key={category}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-gray-900">
                {SALE_DOCUMENT_CATEGORY_LABELS[category]}
              </h4>
              {canUpload ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    value={selectedTypes[category]}
                    disabled={uploading || disabled}
                    onChange={(e) =>
                      setSelectedTypes((prev) => ({
                        ...prev,
                        [category]: e.target.value,
                      }))
                    }
                  >
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {SALE_DOCUMENT_TYPE_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[category] = el;
                    }}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="hidden"
                    disabled={uploading || disabled}
                    onChange={(e) =>
                      void handleFilesSelected(category, e.target.files)
                    }
                  />
                  <button
                    type="button"
                    disabled={uploading || disabled}
                    onClick={() => fileInputRefs.current[category]?.click()}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FilePlus2 className="h-3.5 w-3.5" />
                    )}
                    Adicionar documento
                  </button>
                </div>
              ) : category === 'SYSTEM_GENERATED' ? (
                <span className="text-[11px] text-slate-500">
                  Artefatos do sistema (nota promissória e similares)
                </span>
              ) : null}
            </div>

            {category === 'SYSTEM_GENERATED' && docs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Notas promissórias e outros artefatos gerados pelo sistema
                aparecerão aqui.
              </p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum arquivo nesta categoria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="px-2 py-1.5 font-semibold">Nome</th>
                      <th className="px-2 py-1.5 font-semibold">Tipo</th>
                      <th className="px-2 py-1.5 font-semibold">Descrição</th>
                      <th className="px-2 py-1.5 font-semibold">Data</th>
                      <th className="px-2 py-1.5 font-semibold">Tamanho</th>
                      <th className="px-2 py-1.5 font-semibold">Usuário</th>
                      <th className="px-2 py-1.5 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => {
                      const busy = busyId === doc.id;
                      return (
                        <tr key={doc.id} className="border-b border-gray-100">
                          <td className="px-2 py-1.5 text-gray-900">
                            {doc.original_file_name}
                          </td>
                          <td className="px-2 py-1.5">{doc.document_type_label}</td>
                          <td className="px-2 py-1.5 text-gray-600">
                            {doc.description || '—'}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {formatUploadDate(doc.created_at)}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {formatFileSizeBytes(doc.file_size)}
                          </td>
                          <td className="px-2 py-1.5">{doc.uploader_name || '—'}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Visualizar"
                                disabled={busy || disabled}
                                onClick={() => void openSignedUrl(doc, false)}
                                className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Download"
                                disabled={busy || disabled}
                                onClick={() => void openSignedUrl(doc, true)}
                                className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              {canUpload ? (
                                <>
                                  <button
                                    type="button"
                                    title="Editar descrição"
                                    disabled={busy || disabled}
                                    onClick={() => void handleEditDescription(doc)}
                                    className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Excluir"
                                    disabled={busy || disabled}
                                    onClick={() => void handleDelete(doc)}
                                    className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
