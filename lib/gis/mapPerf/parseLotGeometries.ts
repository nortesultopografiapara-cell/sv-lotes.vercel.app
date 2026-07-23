/**
 * Orquestra parse de geometrias no main thread ou Web Worker (N >= 200).
 */

import {
  parseGeometriesForDisplay,
  type WorkerParseInput,
  type WorkerParseResult,
} from './geometryParseWorkerLogic';

export const GIS_WORKER_LOT_THRESHOLD = 200;

export async function parseLotGeometriesDisplay(
  inputs: WorkerParseInput[],
  signal?: AbortSignal,
): Promise<WorkerParseResult[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    inputs.length < GIS_WORKER_LOT_THRESHOLD
  ) {
    return parseGeometriesForDisplay(inputs);
  }

  try {
    return await runInWorker(inputs, signal);
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return parseGeometriesForDisplay(inputs);
  }
}

function runInWorker(
  inputs: WorkerParseInput[],
  signal?: AbortSignal,
): Promise<WorkerParseResult[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('./geometryParse.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (err) {
      reject(err);
      return;
    }

    const onAbort = () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (ev: MessageEvent<{ results: WorkerParseResult[] }>) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(ev.data.results || []);
    };
    worker.onerror = (err) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ jobs: inputs });
  });
}
