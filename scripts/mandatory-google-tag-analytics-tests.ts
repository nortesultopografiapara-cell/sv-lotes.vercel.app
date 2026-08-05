/**
 * Smoke tests da infraestrutura de analytics (sem rede / sem gtag real).
 * npx tsx scripts/mandatory-google-tag-analytics-tests.ts
 */
import assert from 'node:assert/strict';
import { GOOGLE_ADS_ID, getGoogleAdsId } from '../lib/analytics/config';
import {
  buildConsentDefaultInlineScript,
  buildDefaultConsentState,
} from '../lib/analytics/consent';
import { ANALYTICS_EVENTS } from '../lib/analytics/eventNames';
import {
  getGoogleAdsConversionLabel,
  hasGoogleAdsConversionLabel,
} from '../lib/analytics/conversions';

assert.equal(GOOGLE_ADS_ID, 'AW-18367509513');
assert.equal(getGoogleAdsId().startsWith('AW-'), true);

assert.equal(ANALYTICS_EVENTS.page_view, 'page_view');
assert.equal(ANALYTICS_EVENTS.click_whatsapp, 'click_whatsapp');
assert.equal(ANALYTICS_EVENTS.solicitar_demonstracao, 'solicitar_demonstracao');
assert.equal(ANALYTICS_EVENTS.enviar_formulario, 'enviar_formulario');
assert.equal(ANALYTICS_EVENTS.cadastro_empresa, 'cadastro_empresa');
assert.equal(ANALYTICS_EVENTS.assinatura_realizada, 'assinatura_realizada');

assert.equal(typeof getGoogleAdsConversionLabel('assinatura'), 'string');
assert.equal(getGoogleAdsConversionLabel('assinatura'), '');
assert.equal(hasGoogleAdsConversionLabel('assinatura'), false);

const granted = buildDefaultConsentState('granted');
assert.equal(granted.ad_storage, 'granted');
assert.equal(granted.ad_user_data, 'granted');
assert.equal(granted.analytics_storage, 'granted');
assert.equal(granted.security_storage, 'granted');

const denied = buildDefaultConsentState('denied');
assert.equal(denied.ad_storage, 'denied');
assert.equal(denied.security_storage, 'granted');

const inline = buildConsentDefaultInlineScript();
assert.match(inline, /gtag\('consent', 'default'/);
assert.match(inline, /window\.dataLayer/);
assert.match(inline, /ad_storage/);
assert.match(inline, /ad_user_data/);
assert.match(inline, /ad_personalization/);
assert.match(inline, /analytics_storage/);

console.log('mandatory-google-tag-analytics-tests: OK');
