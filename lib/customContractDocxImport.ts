/**
 * Conversão DOCX → HTML editável para modelos CUSTOM.
 * Biblioteca: mammoth. Sem generateContractHTML. Sem GIS.
 */
import mammoth from 'mammoth';
import { sanitizeImportedContractHtml } from '@/lib/customContractHtml';
import { normalizeCustomFootnotesHtml } from '@/lib/customContractFootnotes';

export const DOCX_IMPORT_LIBRARY = 'mammoth';

export const CUSTOM_DOCX_IMPORT_LIMITATIONS = [
  'Cabeçalhos e rodapés do Word não entram no corpo editável.',
  'O logotipo do cabeçalho do Word não é importado; insira o campo automático Logo depois da importação.',
  'Notas de rodapé do Word acompanham a página da referência (fonte menor). Não são header/footer.',
  'A paginação visual não é pixel-perfect em relação ao Word.',
  'Caixas de texto, SmartArt e formas complexas podem virar parágrafo ou exigir conferência.',
  'Fontes proprietárias e posicionamento absoluto não são reproduzidos fielmente.',
  'PDF continua recusado nesta etapa.',
];

export type DocxImportResult = {
  html: string;
  warnings: string[];
  pageBreakCount: number;
  tableCount: number;
  imageCount: number;
  library: typeof DOCX_IMPORT_LIBRARY;
};

export function isDocxFile(mime?: string | null, fileName?: string | null): boolean {
  const name = String(fileName || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  return name.endsWith('.docx') || type.includes('wordprocessingml.document');
}

export function normalizeDocxHtml(html: string): string {
  let out = String(html || '');
  out = out.replace(
    /<br\b[^>]*style=["'][^"']*page-break[^"']*["'][^>]*\/?>/gi,
    '<div data-sv-page-break="true" class="sv-page-break"></div>',
  );
  out = out.replace(
    /<(p|div|h[1-6])\b([^>]*style=["'][^"']*page-break-before\s*:\s*always[^"']*["'][^>]*)>/gi,
    '<div data-sv-page-break="true" class="sv-page-break"></div><$1$2>',
  );
  out = out.replace(/<w:br\b[^>]*w:type=["']page["'][^>]*\/?>/gi, '<div data-sv-page-break="true" class="sv-page-break"></div>');
  return out;
}

export function collectDocxStructure(html: string): {
  pageBreakCount: number;
  tableCount: number;
  imageCount: number;
} {
  const source = String(html || '');
  return {
    pageBreakCount: (source.match(/data-sv-page-break/gi) || []).length,
    tableCount: (source.match(/<table\b/gi) || []).length,
    imageCount: (source.match(/<img\b/gi) || []).length,
  };
}

function toArrayBuffer(buffer: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return copy.buffer;
}

function toMammothInput(arrayBuffer: ArrayBuffer): { arrayBuffer: ArrayBuffer; buffer?: Buffer } {
  const input: { arrayBuffer: ArrayBuffer; buffer?: Buffer } = { arrayBuffer };
  if (typeof Buffer !== 'undefined') {
    input.buffer = Buffer.from(new Uint8Array(arrayBuffer));
  }
  return input;
}

export async function convertDocxToCustomHtml(
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<DocxImportResult> {
  const warnings: string[] = [];
  const arrayBuffer = toArrayBuffer(buffer);

  const converted = await mammoth.convertToHtml(
    toMammothInput(arrayBuffer),
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const encoded = await image.read('base64');
        return { src: `data:${image.contentType};base64,${encoded}` };
      }),
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    },
  );

  for (const message of converted.messages || []) {
    const text = String(message.message || '').trim();
    if (text) warnings.push(text);
  }

  const normalized = normalizeDocxHtml(converted.value || '');
  const withNotes = normalizeCustomFootnotesHtml(normalized);
  const sanitized = sanitizeImportedContractHtml(withNotes);
  const structure = collectDocxStructure(sanitized);

  if (structure.tableCount === 0) {
    warnings.push('Nenhuma tabela foi detectada. Confira tabelas do Word no Editor A4.');
  }
  if (structure.imageCount === 0) {
    warnings.push('Nenhuma imagem/logotipo foi detectada. Confira o logo no Editor A4.');
  }
  if (structure.pageBreakCount === 0) {
    warnings.push(
      'O DOCX não trouxe quebras de página explícitas. Use o botão Página no editor para separar folhas A4.',
    );
  }
  for (const known of CUSTOM_DOCX_IMPORT_LIMITATIONS) {
    if (!warnings.includes(known)) warnings.push(known);
  }

  return {
    html: sanitized,
    warnings,
    pageBreakCount: structure.pageBreakCount,
    tableCount: structure.tableCount,
    imageCount: structure.imageCount,
    library: DOCX_IMPORT_LIBRARY,
  };
}
