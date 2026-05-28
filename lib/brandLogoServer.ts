import fs from 'fs';
import path from 'path';

/** Caminho absoluto do PNG no servidor (API / PDF). */
export function getSvLotesLogoFilePath(): string {
  return path.join(process.cwd(), 'public', 'logo-sv-lotes.png');
}

/** Base64 data URL para jsPDF.addImage */
export function loadSvLotesLogoDataUrl(): string | null {
  try {
    const filePath = getSvLotesLogoFilePath();
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.warn('[BRAND_LOGO] Falha ao carregar logo', err);
    return null;
  }
}
