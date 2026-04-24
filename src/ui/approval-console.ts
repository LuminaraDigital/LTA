export function renderApprovalConsole(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LTA Approval Console</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, Arial, sans-serif;
        background: #07111f;
        color: #f1f5f9;
      }

      body {
        margin: 0;
        background: radial-gradient(circle at top, #16304d 0, #07111f 60%);
      }

      .page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      h1, h2, h3, p {
        margin-top: 0;
      }

      .hero {
        margin-bottom: 24px;
      }

      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      .card {
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
      }

      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: rgba(59, 130, 246, 0.16);
        color: #93c5fd;
      }

      button {
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
      }

      button.secondary {
        background: #334155;
      }

      button.reject {
        background: #b91c1c;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .meta {
        color: #cbd5e1;
        font-size: 14px;
      }

      .empty {
        opacity: 0.8;
        font-style: italic;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <span class="pill">LTA internal console</span>
        <h1>Committee Approval Console</h1>
        <p class="meta">
          Review live case files, inspect committee verdicts, and approve, reject, or override execution.
        </p>
        <div class="row">
          <button id="refresh-btn">Refresh cases</button>
          <button id="seed-btn" class="secondary">Load latest overview</button>
          <a href="/v1/dashboard/executions" style="align-self:center;color:#93c5fd;font-size:14px;font-weight:600;">Execution dashboard →</a>
        </div>
      </section>

      <section class="card" style="margin-bottom: 20px;">
        <div class="section-header">
          <div>
            <h2>How to use this console</h2>
            <p class="meta">1. Create orchestration cases through the API. 2. Review pending cases here. 3. Issue approve/reject/override actions. 4. Dispatch execution jobs after approval.</p>
          </div>
        </div>
      </section>

      <section class="grid" id="case-grid">
        <article class="card empty">
          No case files loaded yet. Trigger <code>POST /v1/agents/orchestrate</code> with <code>persistCase: true</code> to populate the queue.
        </article>
      </section>
    </main>

    <script>
      const grid = document.getElementById('case-grid');

      function fmt(value) {
        return value == null ? 'n/a' : value;
      }

      function renderCases(cases) {
        if (!cases.length) {
          grid.innerHTML = '<article class="card empty">No case files found.</article>';
          return;
        }

        grid.innerHTML = cases.map((item) => {
          const summary = item.orchestration.summary;
          const topReview = item.orchestration.proposalReviews[0];
          return \`
            <article class="card">
              <span class="pill">\${item.status}</span>
              <h3 style="margin-top: 12px;">\${item.caseId}</h3>
              <p class="meta">Created: \${new Date(item.createdAt).toLocaleString()}</p>
              <p class="meta">Approvals: \${item.approvals.length} | Execution jobs: \${item.executionJobs.length}</p>
              <p class="meta">Approved: \${summary.approvedCount} | Review: \${summary.reviewCount} | Rejected: \${summary.rejectedCount}</p>
              <hr style="border-color: rgba(148, 163, 184, 0.18);" />
              <p><strong>Top proposal verdict:</strong> \${fmt(topReview?.verdict)}</p>
              <p class="meta">\${fmt(topReview?.finalRationale)}</p>
              <div class="row">
                <button onclick="approveCase('\${item.caseId}', 'approve')">Approve</button>
                <button class="secondary" onclick="approveCase('\${item.caseId}', 'override')">Override</button>
                <button class="reject" onclick="approveCase('\${item.caseId}', 'reject')">Reject</button>
                <button class="secondary" onclick="dispatchJob('\${item.caseId}')">Dispatch execution</button>
              </div>
            </article>
          \`;
        }).join('');
      }

      async function loadCases() {
        const res = await fetch('/v1/cases');
        const data = await res.json();
        renderCases(data.items || []);
      }

      async function approveCase(caseId, decision) {
        await fetch('/v1/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            approverId: 'console-operator',
            decision,
            rationale: 'Action issued from approval console.'
          })
        });
        await loadCases();
      }

      async function dispatchJob(caseId) {
        await fetch('/v1/execution-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            proposalId: null,
            requestedBy: 'console-operator',
            connector: 'ton-mcp'
          })
        });
        await loadCases();
      }

      document.getElementById('refresh-btn').addEventListener('click', loadCases);
      document.getElementById('seed-btn').addEventListener('click', loadCases);
      loadCases().catch((error) => {
        console.error(error);
        grid.innerHTML = '<article class="card empty">Failed to load case files.</article>';
      });
    </script>
  </body>
</html>`;
}
