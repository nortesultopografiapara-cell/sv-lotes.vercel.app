/// <reference lib="webworker" />
import { parseGeometriesForDisplay, type WorkerParseInput } from './geometryParseWorkerLogic';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<{ jobs: WorkerParseInput[] }>) => {
  const jobs = ev.data?.jobs || [];
  const results = parseGeometriesForDisplay(jobs);
  ctx.postMessage({ results });
};

export {};
