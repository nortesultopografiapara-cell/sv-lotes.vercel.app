import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { logTopographyQuoteAudit } from '@/lib/master/topography/quotesService';
import { getTopographyQuoteStructure } from '@/lib/master/topography/quoteStructureService';
import {
  buildQuoteCsvText,
  buildQuoteExcelBuffer,
  buildQuotePdfAnalyticalBytes,
  buildQuotePdfMemorialBytes,
  buildQuotePdfSyntheticBytes,
} from '@/lib/master/topography/quoteExports';
import { isResendEmailConfigured, sendResendEmail } from '@/lib/email/resendSend';
import { QUOTE_PDF_BRAND } from '@/lib/master/topography/quotePdfBrand';

type Ctx = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusForErrorCode(code: string | undefined): number {
  switch (code) {
    case 'API_KEY_MISSING':
    case 'FROM_MISSING':
      return 503;
    case 'RECIPIENT_INVALID':
      return 400;
    case 'ATTACHMENT_TOO_LARGE':
      return 413;
    case 'DOMAIN_UNVERIFIED':
      return 502;
    default:
      return 502;
  }
}

export async function POST(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await context.params;
  let auditUserId: string | null = null;
  let auditTo: string | null = null;
  let quoteCode = id;

  try {
    const body = await request.json();
    auditUserId = body.userId ? String(body.userId) : null;
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    if (!isResendEmailConfigured()) {
      await logTopographyQuoteAudit(supabaseAdmin, {
        userId: auditUserId,
        action: 'QUOTE_EMAIL_FAILED',
        entityId: id,
        description: `Falha ao enviar orçamento ${quoteCode}: API key ausente`,
        newData: {
          to: null,
          errorCode: 'API_KEY_MISSING',
          failedAt: new Date().toISOString(),
        },
      });
      return NextResponse.json(
        {
          error:
            'O serviço de e-mail não está configurado. Defina RESEND_API_KEY no ambiente de produção.',
          errorCode: 'API_KEY_MISSING',
        },
        { status: 503 },
      );
    }

    const to = String(body.to || '').trim();
    auditTo = to;
    if (!EMAIL_RE.test(to)) {
      await logTopographyQuoteAudit(supabaseAdmin, {
        userId: auditUserId,
        action: 'QUOTE_EMAIL_FAILED',
        entityId: id,
        description: `Falha ao enviar orçamento ${quoteCode}: destinatário inválido`,
        newData: {
          to,
          errorCode: 'RECIPIENT_INVALID',
          failedAt: new Date().toISOString(),
        },
      });
      return NextResponse.json(
        { error: 'O destinatário informado é inválido.', errorCode: 'RECIPIENT_INVALID' },
        { status: 400 },
      );
    }

    const subject = String(body.subject || '').trim();
    if (!subject) {
      return NextResponse.json({ error: 'Assunto obrigatório.' }, { status: 400 });
    }

    const message = String(body.message || '').trim();
    const attachmentsSel = body.attachments || {};
    const want = {
      synth: Boolean(attachmentsSel.synth ?? attachmentsSel.pdfSynthetic),
      anal: Boolean(attachmentsSel.anal ?? attachmentsSel.pdfAnalytical),
      memorial: Boolean(attachmentsSel.memorial),
      excel: Boolean(attachmentsSel.excel),
      csv: Boolean(attachmentsSel.csv),
    };
    if (!want.synth && !want.anal && !want.memorial && !want.excel && !want.csv) {
      return NextResponse.json(
        { error: 'Selecione ao menos um anexo.' },
        { status: 400 },
      );
    }

    const structure = await getTopographyQuoteStructure(supabaseAdmin, id);
    if (!structure) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    }

    quoteCode = structure.quote.code;
    const payload = {
      quote: structure.quote,
      stages: structure.stages,
      financials: structure.financials,
    };

    const attachments: Array<{
      filename: string;
      content: Buffer | Uint8Array;
      contentType?: string;
    }> = [];

    if (want.synth) {
      const { bytes } = await buildQuotePdfSyntheticBytes(payload);
      attachments.push({
        filename: `${payload.quote.code}-sintetico.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      });
    }
    if (want.anal) {
      const { bytes } = await buildQuotePdfAnalyticalBytes(payload);
      attachments.push({
        filename: `${payload.quote.code}-analitico.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      });
    }
    if (want.memorial) {
      const { bytes } = await buildQuotePdfMemorialBytes(payload);
      attachments.push({
        filename: `${payload.quote.code}-memorial-calculo.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      });
    }
    if (want.excel) {
      const buf = await buildQuoteExcelBuffer(payload);
      attachments.push({
        filename: `${payload.quote.code}-orcamento.xlsx`,
        content: buf,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }
    if (want.csv) {
      const csv = buildQuoteCsvText(payload);
      attachments.push({
        filename: `${payload.quote.code}-orcamento.csv`,
        content: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
      });
    }

    const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>${escapeHtml(message || `Segue em anexo o orçamento ${payload.quote.code}.`)}</p>
      <p style="margin-top:24px;font-size:13px;color:#64748b">${escapeHtml(QUOTE_PDF_BRAND.tradeName)}</p>
    </body></html>`;

    const send = await sendResendEmail({
      to,
      subject,
      html,
      text: message || `Segue em anexo o orçamento ${payload.quote.code}.`,
      attachments,
    });

    if (!send.ok) {
      await logTopographyQuoteAudit(supabaseAdmin, {
        userId: auditUserId,
        action: 'QUOTE_EMAIL_FAILED',
        entityId: id,
        description: `Falha ao enviar orçamento ${payload.quote.code} para ${to}`,
        newData: {
          to,
          errorCode: send.errorCode || 'PROVIDER_ERROR',
          providerMessageSafe: send.providerMessageSafe || null,
          failedAt: new Date().toISOString(),
        },
      });
      return NextResponse.json(
        {
          error: send.error || 'Falha no envio.',
          errorCode: send.errorCode || 'PROVIDER_ERROR',
        },
        { status: statusForErrorCode(send.errorCode) },
      );
    }

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: auditUserId,
      action: 'QUOTE_EMAIL_SENT',
      entityId: id,
      description: `Orçamento ${payload.quote.code} enviado para ${to}`,
      newData: {
        to,
        subject,
        attachments: Object.entries(want)
          .filter(([, v]) => v)
          .map(([k]) => k),
        providerId: send.providerId,
        sentAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      providerId: send.providerId,
      to,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao enviar orçamento.';
    try {
      await logTopographyQuoteAudit(supabaseAdmin, {
        userId: auditUserId,
        action: 'QUOTE_EMAIL_FAILED',
        entityId: id,
        description: `Falha ao enviar orçamento ${quoteCode}`,
        newData: {
          to: auditTo,
          errorCode: 'PROVIDER_ERROR',
          failedAt: new Date().toISOString(),
        },
      });
    } catch {
      /* auditoria best-effort */
    }
    return NextResponse.json(
      {
        error:
          'Não foi possível enviar o e-mail neste momento. Tente novamente em alguns minutos.',
        errorCode: 'PROVIDER_ERROR',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 },
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
