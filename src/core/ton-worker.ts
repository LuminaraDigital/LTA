import type { ExecutionJob, ExecutionJobStatus } from './types.js';
import type { StateStore } from './state-store.js';
import type { ExecutionService } from './execution-service.js';

function nowIso(): string {
  return new Date().toISOString();
}

export interface TonWorker {
  pollAndProcess(): Promise<ExecutionJob[]>;
  runOnce(): Promise<ExecutionJob[]>;
}

function shouldProcess(job: ExecutionJob): boolean {
  return job.target === 'ton-mcp' && job.status === 'queued';
}

function markStatus(job: ExecutionJob, status: ExecutionJobStatus): ExecutionJob {
  return {
    ...job,
    status,
    updatedAt: nowIso(),
  };
}

export function buildTonWorker({
  stateStore,
  executionService,
}: {
  stateStore: StateStore;
  executionService: ExecutionService;
}): TonWorker {
  return {
    async pollAndProcess() {
      const queuedJobs = stateStore
        .listExecutionJobs()
        .filter(shouldProcess);
      const processed: ExecutionJob[] = [];

      for (const job of queuedJobs) {
        const running = markStatus(job, 'running');
        stateStore.updateExecutionJob(running);
        const result = executionService.dispatch(running);
        const finished =
          result.status === 'succeeded'
            ? result
            : {
                ...result,
                status: 'failed' as const,
                updatedAt: nowIso(),
              };
        stateStore.updateExecutionJob(finished);
        processed.push(finished);
      }

      return processed;
    },
    async runOnce() {
      return this.pollAndProcess();
    },
  };
}
