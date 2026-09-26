/**
 * Auditoria de drift do Capability Registry.
 * npx tsx scripts/audit-assistant-capability-drift.ts
 */
import { countAssistantCapabilities } from '../lib/assistant/capabilities/registry';
import { auditAssistantCapabilityDrift } from '../lib/assistant/capabilities/drift';

const drift = auditAssistantCapabilityDrift();
const counts = countAssistantCapabilities();
console.log(JSON.stringify({ counts, drift }, null, 2));
if (drift.missingSources.length || drift.missingRoutes.length || drift.proceduresWithoutCapability.length) {
  console.error('ASSISTANT_CAPABILITY_DRIFT_FAIL');
  process.exit(1);
}
console.log('ASSISTANT_CAPABILITY_DRIFT_OK');
console.log(drift.summary);
