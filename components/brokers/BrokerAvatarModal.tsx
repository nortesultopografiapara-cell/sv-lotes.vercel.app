'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { brokerInitial, validateBrokerAvatarFile } from '@/lib/brokerAvatar';
import {
  removeBrokerAvatarFile,
  saveBrokerAvatarFile,
  type BrokerAvatarActor,
} from '@/lib/brokerAvatarStorage';
import type { BrokerRow } from '@/lib/brokerDelete';

type AvatarBroker = BrokerRow & {
  name?: string | null;
  avatar_url?: string | null;
};

type BrokerAvatarModalProps = {
  open: boolean;
  broker: AvatarBroker | null;
  actor: BrokerAvatarActor;
  onClose: () => void;
  onSaved: (nextUrl: string | null) => void;
};

export function BrokerAvatarModal({
  open,
  broker,
  actor,
  onClose,
  onSaved,
}: BrokerAvatarModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setPendingFile(null);
    setError('');
    setSaving(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open]);

  if (!open || !broker) return null;

  const hasPhoto = Boolean(broker.avatar_url) && !pendingFile;
  const displaySrc = previewUrl || (pendingFile ? null : broker.avatar_url) || null;

  const pickFile = () => inputRef.current?.click();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const check = validateBrokerAvatarFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError('');
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const cancelPending = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const save = async () => {
    if (!pendingFile) return;
    setSaving(true);
    setError('');
    try {
      const url = await saveBrokerAvatarFile({ supabase, actor, broker, file: pendingFile });
      onSaved(url);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a foto.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      await removeBrokerAvatarFile({ supabase, actor, broker });
      onSaved(null);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a foto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sv-modal-overlay animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="sv-modal-shell bg-[var(--bg-card)] border border-[var(--border-color)] p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Foto do corretor</h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{broker.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          {displaySrc ? (
            <img
              src={displaySrc}
              alt=""
              className="w-24 h-24 rounded-full object-cover border border-[var(--border-color)]"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[var(--bg-card-alt)] border border-[var(--border-color)] flex items-center justify-center text-2xl font-bold text-[var(--text-secondary)]">
              {brokerInitial(broker.name)}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />

          {error ? (
            <p className="text-xs text-red-400 text-center">{error}</p>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)] text-center">JPG, PNG ou WebP · até 2 MB</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {pendingFile ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={cancelPending}
                className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-1.5 text-sm font-bold rounded-lg bg-orange-500 text-[var(--text-primary)] hover:bg-orange-600 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar foto
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={pickFile}
                className="px-4 py-2 text-sm font-bold rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {hasPhoto ? 'Alterar foto' : 'Adicionar foto'}
              </button>
              {hasPhoto ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove()}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] text-red-400 hover:bg-red-500/10 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Remover foto
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
