/**
 * Seletor de versões do contrato — overflow do dropdown e ordenação.
 * npx tsx scripts/mandatory-contract-version-select-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  isCurrentContractVersion,
  resolveContractVersionHtml,
  sortContractVersionsNewestFirst,
} from '../lib/contractVersionSelect';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const css = fs.readFileSync(
  path.join(process.cwd(), 'app/contracts/contracts-workspace.css'),
  'utf8',
);
const page = fs.readFileSync(
  path.join(process.cwd(), 'app/contracts/page.tsx'),
  'utf8',
);

function testCssDoesNotClipVersionMenu() {
  const barMatch = css.match(
    /\.contracts-desktop-action-bar\s*\{([\s\S]*?)\n\}/,
  );
  assert(!!barMatch, 'bloco da action bar existe');
  const barBody = barMatch![1];
  assert(
    !/overflow-x\s*:\s*auto/.test(barBody),
    'action bar NÃO usa overflow-x:auto (isso recorta o menu para cima)',
  );
  assert(/overflow\s*:\s*visible/.test(barBody), 'action bar overflow visível');
  assert(
    css.includes('.contracts-action-cluster') &&
      /overflow-x:\s*auto/.test(
        css.match(/\.contracts-action-cluster\s*\{([\s\S]*?)\n\}/)?.[1] || '',
      ),
    'scroll horizontal ficou no cluster de botões, não no seletor',
  );
  assert(
    css.includes('z-index: 80') && css.includes('bottom: calc(100% + 0.375rem)'),
    'menu abre para cima com z-index acima do PDF',
  );
  assert(
    css.includes('position: fixed') && css.includes('z-index: 400'),
    'mobile: menu fixed fora do dock com overflow',
  );
  console.log('OK testCssDoesNotClipVersionMenu');
}

function testPageWiresViewNotDownload() {
  assert(page.includes('handleSelectContractVersion'), 'handler de visualizar');
  assert(
    page.includes('sortContractVersionsNewestFirst'),
    'lista da mais recente para a mais antiga',
  );
  const desktopSelect = page.slice(
    page.indexOf('className="contracts-version-select"'),
    page.indexOf('Ver histórico completo') + 80,
  );
  assert(
    desktopSelect.includes('handleSelectContractVersion'),
    'dropdown desktop visualiza versão',
  );
  assert(
    !desktopSelect.includes('handleDownloadVersion'),
    'dropdown desktop NÃO baixa ao clicar na versão',
  );
  console.log('OK testPageWiresViewNotDownload');
}

function testSortNewestFirst() {
  const rows = [
    { id: 'v1', version: 1, created_at: '2026-01-01' },
    { id: 'v5', version: 5, created_at: '2026-07-01' },
    { id: 'v3', version: 3, created_at: '2026-03-01' },
  ];
  const sorted = sortContractVersionsNewestFirst(rows);
  assert(
    sorted.map((r) => r.version).join(',') === '5,3,1',
    'ordem 5 → 3 → 1',
  );
  const single = sortContractVersionsNewestFirst([{ id: 'only', version: 1 }]);
  assert(single.length === 1 && single[0].id === 'only', 'uma versão permanece');
  console.log('OK testSortNewestFirst');
}

function testCurrentAndHtmlHelpers() {
  assert(
    isCurrentContractVersion({ id: 'a', is_current: true }, 'a'),
    'is_current true é Atual',
  );
  assert(
    !isCurrentContractVersion({ id: 'old', is_current: false }, 'current'),
    'versão antiga não é Atual',
  );
  assert(
    resolveContractVersionHtml({ generated_html: ' <p>ok</p> ' }) === '<p>ok</p>',
    'HTML persistido da versão',
  );
  assert(
    resolveContractVersionHtml({ html_content: '<div/>' }) === '<div/>',
    'fallback html_content',
  );
  console.log('OK testCurrentAndHtmlHelpers');
}

function testDoesNotTouchRecantoHotfix() {
  const recantoParties = fs.readFileSync(
    path.join(process.cwd(), 'lib/recantoPrimaveraContractParties.ts'),
    'utf8',
  );
  assert(
    recantoParties.includes('margin: 0 0 18px 0; text-align: right'),
    'hotfix Recanto da data permanece',
  );
  console.log('OK testDoesNotTouchRecantoHotfix');
}

testCssDoesNotClipVersionMenu();
testPageWiresViewNotDownload();
testSortNewestFirst();
testCurrentAndHtmlHelpers();
testDoesNotTouchRecantoHotfix();
console.log('OK — mandatory-contract-version-select-tests passed');
