CREATE TABLE IF NOT EXISTS case_files (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  venue TEXT NOT NULL,
  proposal_json JSONB NOT NULL,
  committee_review_json JSONB NOT NULL,
  delegation_json JSONB NOT NULL,
  approvals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  execution_job_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  events_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_case_files_status_created_at
  ON case_files (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_files_strategy_updated_at
  ON case_files (strategy_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_files_proposal_id
  ON case_files (proposal_id);

CREATE TABLE IF NOT EXISTS agent_journal (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  linked_case_file_id TEXT,
  linked_proposal_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_journal_agent_timestamp
  ON agent_journal (agent_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_journal_case_timestamp
  ON agent_journal (linked_case_file_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS delegation_tasks (
  id TEXT PRIMARY KEY,
  case_file_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  assigned_by_agent_id TEXT NOT NULL,
  assigned_to_agent_id TEXT NOT NULL,
  assigned_to_role TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  depends_on_task_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_delegation_tasks_case_priority
  ON delegation_tasks (case_file_id, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_delegation_tasks_assignee_status
  ON delegation_tasks (assigned_to_agent_id, status);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  case_file_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_case_timestamp
  ON approvals (case_file_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS execution_jobs (
  id TEXT PRIMARY KEY,
  case_file_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  target TEXT NOT NULL,
  mode TEXT NOT NULL,
  venue TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  request_payload_json JSONB NOT NULL,
  result_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_execution_jobs_case_created_at
  ON execution_jobs (case_file_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_jobs_status_updated_at
  ON execution_jobs (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS proposal_outcomes (
  case_file_id TEXT PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL,
  realized_pnl_usd DOUBLE PRECISION NOT NULL,
  realized_pnl_bps DOUBLE PRECISION NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposal_outcomes_recorded_at
  ON proposal_outcomes (recorded_at DESC);

CREATE TABLE IF NOT EXISTS agent_performance (
  agent_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  cases_reviewed INTEGER NOT NULL,
  support_wins INTEGER NOT NULL,
  support_losses INTEGER NOT NULL,
  oppose_wins INTEGER NOT NULL,
  oppose_losses INTEGER NOT NULL,
  escalate_count INTEGER NOT NULL,
  abstain_count INTEGER NOT NULL,
  contribution_score DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_performance_score
  ON agent_performance (contribution_score DESC, updated_at DESC);
