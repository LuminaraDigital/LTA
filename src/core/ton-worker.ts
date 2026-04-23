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
        let finished: ExecutionJob;
        try {
          const dispatched = await executionService.dispatch(running);
          const reconciled = await executionService.reconcile(dispatched);
          finished =
            reconciled.status === 'succeeded' || reconciled.status === 'failed'
              ? reconciled
              : {
                  ...reconciled,
                  status: 'failed' as const,
                  updatedAt: nowIso(),
                  result: {
                    timestamp: nowIso(),
                    summary: 'TON job ended in an unexpected state.',
                    rawOutput: JSON.stringify({
                      jobId: job.id,
                      status: reconciled.status,
                    }),
                  },
                };
        } catch (error) {
          finished = {
            ...running,
            status: 'failed',
            updatedAt: nowIso(),
            result: {
              timestamp: nowIso(),
              summary: error instanceof Error ? error.message : 'TON execution failed.',
              rawOutput: JSON.stringify({
                jobId: job.id,
              }),
            },
          };
        }
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
