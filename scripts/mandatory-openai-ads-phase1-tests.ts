/**
 * OpenAI Ads — Fase 1.
 * O SDK oficial não é carregado nestes testes. Nenhuma conversão sai daqui.
 * npx tsx scripts/mandatory-openai-ads-phase1-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AUTHORIZED_OPENAI_ADS_PIXEL_ID,
  OPENAI_ADS_SDK_URL,
  isProductionAdsHost,
  resolveOpenAiAdsRuntime,
} from '../lib/openai-ads/config';
import { parseOpenAiAdsConsent, readOpenAiAdsConsent, writeOpenAiAdsConsent } from '../lib/openai-ads/consent';
import {
  clearOpenAiAdsAttribution,
  isSafeAttributionValue,
  readOpenAiAdsAttribution,
  rememberOpenAiAdsAttribution,
} from '../lib/openai-ads/attribution';
import { evaluateLeadCreated, measureLeadCreatedIfEligible } from '../lib/openai-ads/events';
import {
  armCommercialDocumentBoundary,
  hardNavigationDestination,
  releaseOpenAiAdsDocument,
  shouldForceFullDocumentLoad,
} from '../lib/openai-ads/isolation';
import {
  grantOpenAiAdsConsent,
  installOfficialOpenAiAdsLoader,
  measureOpenAiAdsPageView,
  shouldRequestOpenAiAdsSdk,
  type OpenAiAdsDom,
  type OpenAiAdsScript,
  type OpenAiAdsWindow,
} from '../lib/openai-ads/pixel';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log('  ✅', label);
    passed++;
  } else {
    console.error('  ❌', label);
    failed++;
  }
}

const root = path.resolve(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(rel: string, acc: string[] = []): string[] {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const next = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(next, acc);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      acc.push(next.replace(/\\/g, '/'));
    }
  }
  return acc;
}

function fakeDom(): { doc: OpenAiAdsDom; scripts: OpenAiAdsScript[] } {
  const scripts: OpenAiAdsScript[] = [];
  const doc: OpenAiAdsDom = {
    createElement: () => {
      const script = { async: false, src: '' };
      scripts.push(script);
      return script;
    },
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => undefined } }],
  };
  return { doc, scripts };
}

const enabled = {
  enabledFlag: 'true',
  pixelId: AUTHORIZED_OPENAI_ADS_PIXEL_ID,
  vercelEnv: 'preview',
  hostname: 'sv-lotes-preview.vercel.app',
};

console.log('\n1. Ativação');
assert(resolveOpenAiAdsRuntime({}).reason === 'disabled', 'sem variável, o Pixel fica desligado');
assert(
  resolveOpenAiAdsRuntime({ ...enabled, vercelEnv: 'production' }).reason === 'production_blocked',
  'VERCEL_ENV=production bloqueia mesmo com a flag',
);
assert(
  resolveOpenAiAdsRuntime({ ...enabled, hostname: 'www.svlotes.com.br' }).reason === 'production_host_blocked',
  'www.svlotes.com.br bloqueia mesmo com a flag',
);
assert(isProductionAdsHost('svlotes.com.br'), 'apex de Production é host bloqueado');
assert(
  resolveOpenAiAdsRuntime({ ...enabled, pixelId: 'outro' }).reason === 'pixel_id_not_authorized',
  'ID diferente do autorizado não inicializa',
);
const preview = resolveOpenAiAdsRuntime(enabled);
assert(preview.active && preview.pixelId === AUTHORIZED_OPENAI_ADS_PIXEL_ID, 'preview com o ID autorizado fica ativo');
assert(resolveOpenAiAdsRuntime({ ...enabled, debugFlag: 'true' }).debug === true, 'debug só com flag explícita');
assert(resolveOpenAiAdsRuntime(enabled).debug === false, 'debug fica desligado por padrão');

console.log('\n2. Consentimento e loader');
const memory = new Map<string, string>();
const store = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};
assert(parseOpenAiAdsConsent(null) === 'unknown', 'consentimento ausente permanece desconhecido');
assert(readOpenAiAdsConsent(store) === 'unknown', 'storage vazio não concede consentimento');
writeOpenAiAdsConsent(store, 'denied');
assert(readOpenAiAdsConsent(store) === 'denied', 'recusa fica gravada');
assert(
  shouldRequestOpenAiAdsSdk({ active: true, consent: 'denied', pathname: '/' }) === false,
  'recusa não pede o SDK',
);
assert(
  shouldRequestOpenAiAdsSdk({ active: true, consent: 'unknown', pathname: '/' }) === false,
  'consentimento pendente não pede o SDK',
);
assert(
  shouldRequestOpenAiAdsSdk({ active: false, consent: 'granted', pathname: '/' }) === false,
  'flag desligada não pede o SDK',
);
assert(
  shouldRequestOpenAiAdsSdk({ active: true, consent: 'granted', pathname: '/charges' }) === false,
  'rota interna não pede o SDK',
);
assert(
  shouldRequestOpenAiAdsSdk({ active: true, consent: 'granted', pathname: '/' }) === true,
  'só a página comercial com aceite pede o SDK',
);

const inactiveWindow: OpenAiAdsWindow = {};
const inactiveDom = fakeDom();
assert(
  shouldRequestOpenAiAdsSdk({ active: false, consent: 'granted', pathname: '/' }) === false &&
    inactiveDom.scripts.length === 0,
  'desligado não cria elemento de script',
);
assert(inactiveWindow.oaiq === undefined, 'desligado não cria a fila oaiq');

const { doc, scripts } = fakeDom();
const win: OpenAiAdsWindow = {};
const started = performance.now();
const script = installOfficialOpenAiAdsLoader(win, doc, AUTHORIZED_OPENAI_ADS_PIXEL_ID, false);
const loaderMs = performance.now() - started;
assert(script?.async === true && script.src === OPENAI_ADS_SDK_URL, 'loader oficial é async e usa o CDN oficial');
assert(scripts.length === 1, 'o loader cria um único script');
assert(loaderMs < 20, `loader local ficou em ${loaderMs.toFixed(2)} ms`);
const commands = win.oaiq?.q ?? [];
assert(commands[0]?.[0] === 'consent' && commands[0]?.[1] === false, 'consentimento falso vem antes do init');
assert(commands[1]?.[0] === 'init', 'init vem depois do consentimento falso');
const init = commands[1]?.[1] as Record<string, unknown>;
assert(init.pixelId === AUTHORIZED_OPENAI_ADS_PIXEL_ID, 'init usa o Pixel autorizado');
assert(!('user' in init) && !('email_sha256' in init), 'init não envia usuário nem hash');
assert(Object.keys(init).join(',') === 'pixelId', 'init sem debug só carrega pixelId');
grantOpenAiAdsConsent(win);
assert(measureOpenAiAdsPageView(win) === true, 'page_viewed entra na fila depois do aceite');
assert(measureOpenAiAdsPageView(win) === false, 'page_viewed não repete');
assert(commands.some((command) => command[0] === 'measure' && command[1] === 'page_viewed'), 'a fila contém page_viewed');
assert(!commands.some((command) => command[1] === 'lead_created'), 'o loader não emite lead_created');

console.log('\n3. UTM e oppref');
const attribution = readOpenAiAdsAttribution(
  '?utm_source=chatgpt&utm_medium=cpc&utm_campaign=sv-lotes&utm_content=logo&utm_term=loteamento&oppref=clk_123&email=pessoa@empresa.com',
);
assert(attribution.utm_source === 'chatgpt', 'utm_source é guardado');
assert(attribution.utm_medium === 'cpc', 'utm_medium é guardado');
assert(attribution.utm_campaign === 'sv-lotes', 'utm_campaign é guardado');
assert(attribution.utm_content === 'logo', 'utm_content é guardado');
assert(attribution.utm_term === 'loteamento', 'utm_term é guardado');
assert(attribution.oppref === 'clk_123', 'oppref é guardado');
assert(!('email' in attribution), 'parâmetro de e-mail não entra na atribuição');
assert(isSafeAttributionValue('pessoa@empresa.com') === false, 'e-mail é recusado');
rememberOpenAiAdsAttribution(store, '?utm_source=chatgpt&oppref=clk_123');
assert(store.getItem('svlotes.openai-ads.attribution')?.includes('clk_123') === true, 'atribuição fica na sessão');
clearOpenAiAdsAttribution(store);
assert(store.getItem('svlotes.openai-ads.attribution') === null, 'recusa apaga a atribuição');

console.log('\n4. lead_created');
assert(
  evaluateLeadCreated({ channel: 'whatsapp_click', requestCompleted: true }).reason ===
    'whatsapp_is_not_a_confirmed_lead',
  'clique no WhatsApp não é lead confirmado',
);
assert(
  evaluateLeadCreated({ channel: 'mailto', requestCompleted: true }).reason === 'mailto_is_not_a_confirmed_lead',
  'abertura de e-mail não é lead confirmado',
);
assert(
  evaluateLeadCreated({ channel: 'completed_commercial_request', requestCompleted: false }).reason ===
    'request_not_completed',
  'solicitação sem conclusão não emite',
);
const leadWindow: OpenAiAdsWindow = { oaiq: Object.assign(() => undefined, { q: [] as unknown[][] }) };
leadWindow.oaiq = ((...args: unknown[]) => {
  leadWindow.oaiq?.q.push(args);
}) as OpenAiAdsWindow['oaiq'];
if (leadWindow.oaiq) leadWindow.oaiq.q = [];
const blocked = measureLeadCreatedIfEligible(leadWindow, { channel: 'whatsapp_click', requestCompleted: true });
assert(blocked.emit === false && (leadWindow.oaiq?.q.length ?? 0) === 0, 'WhatsApp não chama oaiq');
const eligible = measureLeadCreatedIfEligible(leadWindow, {
  channel: 'completed_commercial_request',
  requestCompleted: true,
});
const leadCommand = leadWindow.oaiq?.q[0];
const leadPayload = leadCommand?.[2] as Record<string, unknown> | undefined;
assert(eligible.emit === true && leadCommand?.[1] === 'lead_created', 'lead concluído emite lead_created');
assert(leadPayload?.type === 'customer_action' && Object.keys(leadPayload).join(',') === 'type', 'o evento não leva dados pessoais');

console.log('\n5. Isolamento do código');
const allowed = new Set([
  'app/page.tsx',
  'components/landing/LandingPage.tsx',
  'components/landing/OpenAiAdsMeasurement.tsx',
  'lib/openai-ads/config.ts',
  'lib/openai-ads/consent.ts',
  'lib/openai-ads/attribution.ts',
  'lib/openai-ads/pixel.ts',
  'lib/openai-ads/events.ts',
  'lib/openai-ads/isolation.ts',
  'scripts/mandatory-openai-ads-phase1-tests.ts',
]);
const markers = ['oaiq', 'bzrcdn.openai.com', 'lead_created', 'lib/openai-ads'];
const offenders: string[] = [];
for (const file of [...walk('app'), ...walk('components'), ...walk('lib')]) {
  if (allowed.has(file)) continue;
  const source = read(file);
  if (markers.some((marker) => source.includes(marker))) offenders.push(file);
}
assert(offenders.length === 0, offenders.length ? `marcador fora da área pública: ${offenders.join(', ')}` : 'Pixel ausente do layout e das áreas internas');
const layout = read('app/layout.tsx');
assert(!layout.includes('OpenAiAds') && !layout.includes('oaiq') && !layout.includes('bzrcdn'), 'layout global não instala o Pixel');
for (const rel of [
  'components/landing/sections/ContactSection.tsx',
  'components/landing/components/LandingCta.tsx',
  'components/landing/sections/DemoCtaSection.tsx',
  'components/landing/constants/landingConfig.ts',
  'lib/analytics/events.ts',
]) {
  const source = read(rel);
  assert(!source.includes('lead_created') && !source.includes('oaiq'), `${rel} não emite lead_created`);
}
const adsSource = [
  read('lib/openai-ads/config.ts'),
  read('lib/openai-ads/pixel.ts'),
  read('lib/openai-ads/events.ts'),
  read('components/landing/OpenAiAdsMeasurement.tsx'),
].join('\n');
assert(!adsSource.includes('api.ads.openai.com'), 'não há chamada à API de Conversões');
assert(!adsSource.includes('email_sha256') && !adsSource.includes('phone_number_sha256'), 'não há hash de e-mail ou telefone');
assert(!adsSource.includes('OPENAI_ADS_API_KEY') && !adsSource.includes('Bearer '), 'não há chave secreta');
assert(read('app/page.tsx').includes('readOpenAiAdsServerGate'), 'a home passa pelo gate do servidor');
assert(read('components/landing/LandingPage.tsx').includes('openAiAdsEnabled = false'), 'a landing continua desligada quando o gate não autoriza');

console.log('\n6. Isolamento do documento');
const home = 'https://preview.example.com/';
assert(shouldForceFullDocumentLoad(home, 'https://preview.example.com/login') === true, 'ir para /login recarrega o documento');
assert(shouldForceFullDocumentLoad(home, 'https://preview.example.com/portal-cliente') === true, 'ir para o portal recarrega o documento');
assert(shouldForceFullDocumentLoad(home, 'https://preview.example.com/demo') === true, 'ir para /demo recarrega o documento');
assert(shouldForceFullDocumentLoad(home, 'https://preview.example.com/#contato') === false, 'âncora da própria home permanece no documento');
assert(shouldForceFullDocumentLoad(home, 'https://wa.me/5594999999999') === false, 'WhatsApp externo não é reescrito');
assert(
  hardNavigationDestination({
    currentHref: home,
    anchorHref: 'https://preview.example.com/login',
    button: 0,
    modified: false,
    target: null,
  }) === 'https://preview.example.com/login',
  'clique simples em /login pede carregamento completo',
);
assert(
  hardNavigationDestination({
    currentHref: home,
    anchorHref: 'https://preview.example.com/login',
    button: 0,
    modified: true,
    target: null,
  }) === null,
  'Ctrl+clique não sequestra a navegação',
);
assert(
  hardNavigationDestination({
    currentHref: home,
    anchorHref: 'https://preview.example.com/charges',
    button: 0,
    modified: false,
    target: '_blank',
  }) === null,
  'nova aba não altera o documento atual',
);

const removed: string[] = [];
const cookieWrites: string[] = [];
const storageRemoved: string[] = [];
const queued: unknown[][] = [];
const boundaryWindow: OpenAiAdsWindow = {
  oaiq: Object.assign((...args: unknown[]) => {
    queued.push(args);
  }, { q: queued }),
  __svlotesOpenAiPageViewed: true,
};
const boundaryDoc = {
  get cookie() {
    return cookieWrites.join('; ');
  },
  set cookie(value: string) {
    cookieWrites.push(value);
  },
  querySelectorAll: () => [{ remove: () => removed.push('script') }],
};
releaseOpenAiAdsDocument(boundaryWindow, boundaryDoc, { removeItem: (key) => storageRemoved.push(key) });
assert(queued[0]?.[0] === 'consent' && queued[0]?.[1] === false, 'revogação envia consentimento falso antes de apagar a fila');
assert(boundaryWindow.oaiq === undefined, 'a fila oaiq sai da janela');
assert(boundaryWindow.__svlotesOpenAiPageViewed === undefined, 'o controle de page_viewed é zerado com o documento');
assert(removed.length === 1, 'o script oficial é removido');
assert(cookieWrites.some((entry) => entry.startsWith('__oppref=')), 'o cookie __oppref é apagado');
assert(cookieWrites.some((entry) => entry.startsWith('__obref=')), 'o cookie __obref é apagado');
assert(cookieWrites.some((entry) => entry.startsWith('__oaiq_consent=')), 'o cookie de consentimento do SDK é apagado');
assert(storageRemoved.includes('oaiq_consent'), 'o storage do SDK é apagado');
assert(measureOpenAiAdsPageView(boundaryWindow) === false, 'sem fila, page_viewed não é emitido de novo');

let leftTo = '';
const historyCalls: string[] = [];
const history = {
  pushState: (data: unknown, unused: string, url?: string | URL | null) => {
    historyCalls.push(`push:${String(url)}`);
  },
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => {
    historyCalls.push(`replace:${String(url)}`);
  },
};
const location = { href: home, assign: (url: string) => { leftTo = url; }, reload: () => undefined };
const disarm = armCommercialDocumentBoundary(history, location, (url) => {
  leftTo = url;
});
history.pushState({}, '', '/#contato');
history.pushState({}, '', '/login');
disarm();
history.pushState({}, '', '/charges');
assert(historyCalls.includes('push:/#contato'), 'âncora usa a navegação normal');
assert(!historyCalls.includes('push:/login'), 'pushState para /login não permanece na mesma página');
assert(leftTo === 'https://preview.example.com/login', 'a saída para /login troca o documento');
assert(historyCalls.includes('push:/charges'), 'depois de desarmar, o histórico volta ao normal');
assert(read('components/landing/OpenAiAdsMeasurement.tsx').includes('Revogar medição'), 'a revogação fica disponível depois do aceite');
assert(read('components/landing/OpenAiAdsMeasurement.tsx').includes('releaseOpenAiAdsDocument'), 'sair da home libera o SDK');
const internalRoutes = ['app/login/page.tsx', 'app/charges/page.tsx', 'app/layout.tsx'].filter((rel) => fs.existsSync(path.join(root, rel)));
for (const rel of internalRoutes) {
  const source = read(rel);
  assert(!source.includes('openai-ads') && !source.includes('oaiq'), `${rel} não monta o SDK`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
