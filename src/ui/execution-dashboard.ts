export function renderExecutionDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LTA — Executions</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, Arial, sans-serif;
        background: #07111f;
        color: #f1f5f9;
      }
      body {
        margin: 0;
        background: radial-gradient(circle at top, #16304d 0, #07111f 55%);
      }
      .page {
        max-width: 1280px;
        margin: 0 auto;
        padding: 28px 20px 56px;
      }
      h1, h2, h3 {
        margin-top: 0;
      }
      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 20px;
      }
      .nav a {
        color: #93c5fd;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }
      .nav a:hover {
        text-decoration: underline;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .pill-queued { background: rgba(148, 163, 184, 0.25); color: #e2e8f0; }
      .pill-running { background: rgba(59, 130, 246, 0.25); color: #93c5fd; }
      .pill-pending { background: rgba(234, 179, 8, 0.22); color: #fde047; }
      .pill-succeeded { background: rgba(34, 197, 94, 0.2); color: #86efac; }
      .pill-failed { background: rgba(239, 68, 68, 0.22); color: #fca5a5; }
      .card {
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 14px;
        padding: 18px;
        margin-bottom: 16px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.25);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }
      .stat {
        background: rgba(30, 41, 59, 0.85);
        border-radius: 12px;
        padding: 14px;
        border: 1px solid rgba(148, 163, 184, 0.15);
      }
      .stat .n {
        font-size: 1.65rem;
        font-weight: 800;
        line-height: 1.1;
      }
      .stat .l {
        font-size: 12px;
        color: #94a3b8;
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .meta {
        color: #cbd5e1;
        font-size: 13px;
      }
      button {
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      button.secondary {
        background: #334155;
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-top: 12px;
      }
      label {
        font-size: 13px;
        color: #94a3b8;
        display: block;
        margin-bottom: 4px;
      }
      input, select {
        width: 100%;
        max-width: 420px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.9);
        color: #f1f5f9;
        font-size: 14px;
        box-sizing: border-box;
      }
      .form-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        align-items: end;
      }
      .job-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }
      .mono {
        font-family: ui-monospace, monospace;
        font-size: 12px;
        word-break: break-all;
        color: #e2e8f0;
      }
      pre.raw {
        margin: 12px 0 0;
        padding: 12px;
        background: rgba(0, 0, 0, 0.35);
        border-radius: 8px;
        overflow: auto;
        max-height: 280px;
        font-size: 11px;
        border: 1px solid rgba(148, 163, 184, 0.15);
      }
      .banner {
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 13px;
        margin-bottom: 16px;
        display: none;
      }
      .banner.show { display: block; }
      .banner.ok { background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.35); }
      .banner.err { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); }
    </style>
  </head>
  <body>
    <main class="page">
      <nav class="nav">
        <a href="/v1/console">← Committee console</a>
        <a href="/health">API health</a>
        <a href="/v1/execution/jobs">Jobs JSON</a>
      </nav>

      <header>
        <span class="pill pill-running" style="background: rgba(59, 130, 246, 0.2);">Executions</span>
        <h1>Execution dashboard</h1>
        <p class="meta">
          Live view of execution jobs: queue status, TON <span class="mono">normalizedHash</span>, and reconciliation polls.
          Queue a job after approvals, then run the TON worker to dispatch and reconcile on-chain.
        </p>
      </header>

      <div id="banner" class="banner"></div>

      <section class="stats" id="stats"></section>

      <section class="card">
        <h2>Queue a job</h2>
        <p class="meta">Uses <code>POST /v1/execution/jobs</code>. The case must exist and <code>proposalId</code> must match the case&rsquo;s proposal.</p>
        <div class="form-grid">
          <div>
            <label for="case-select">Case</label>
            <select id="case-select">
              <option value="">— Load cases —</option>
            </select>
          </div>
          <div>
            <label for="proposal-id">Proposal ID</label>
            <input id="proposal-id" type="text" placeholder="Filled when you pick a case" autocomplete="off" />
          </div>
          <div>
            <label for="directive">Directive</label>
            <select id="directive">
              <option value="ton-mcp-transfer">ton-mcp-transfer</option>
              <option value="ton-mcp-swap">ton-mcp-swap</option>
              <option value="exchange-webhook">exchange-webhook</option>
            </select>
          </div>
          <div class="row" style="margin-top: 24px;">
            <button type="button" id="queue-btn">Queue job</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="job-head">
          <h2 style="margin: 0;">Jobs</h2>
          <div class="row" style="margin: 0;">
            <button type="button" id="refresh-btn">Refresh</button>
            <button type="button" class="secondary" id="worker-btn">Run TON worker once</button>
          </div>
        </div>
        <p class="meta" style="margin-top: 8px;">Processes queued TON jobs (<code>POST /v1/workers/ton/run-once</code>).</p>
        <div id="jobs-root"></div>
      </section>
    </main>

    <script>
      const statsEl = document.getElementById('stats');
      const jobsRoot = document.getElementById('jobs-root');
      const banner = document.getElementById('banner');
      const caseSelect = document.getElementById('case-select');
      const proposalInput = document.getElementById('proposal-id');
      const directiveEl = document.getElementById('directive');

      function showBanner(text, ok) {
        banner.textContent = text;
        banner.className = 'banner show ' + (ok ? 'ok' : 'err');
        setTimeout(() => { banner.className = 'banner'; }, 6000);
      }

      function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function statusPill(status) {
        const c = {
          queued: 'pill-queued',
          running: 'pill-running',
          pending: 'pill-pending',
          succeeded: 'pill-succeeded',
          failed: 'pill-failed',
        }[status] || 'pill-queued';
        return '<span class="pill ' + c + '">' + escapeHtml(status) + '</span>';
      }

      function renderStats(jobs) {
        const counts = { queued: 0, running: 0, pending: 0, succeeded: 0, failed: 0 };
        for (const j of jobs) {
          if (counts[j.status] != null) counts[j.status]++;
        }
        const parts = ['queued', 'running', 'pending', 'succeeded', 'failed'];
        statsEl.innerHTML = parts.map((k) =>
          '<div class="stat"><div class="n">' + counts[k] + '</div><div class="l">' + k + '</div></div>'
        ).join('');
      }

      function renderJobs(jobs) {
        if (!jobs.length) {
          jobsRoot.innerHTML = '<p class="meta">No execution jobs yet. Queue one above or call the API.</p>';
          return;
        }
        const sorted = [...jobs].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        jobsRoot.innerHTML = sorted.map((j) => {
          const r = j.result || {};
          const dir = j.requestPayload && j.requestPayload.directive ? j.requestPayload.directive : '—';
          const hash = r.normalizedHash || '—';
          const chain = r.chainStatus || '—';
          const polls = r.reconciliation && r.reconciliation.pollHistory
            ? r.reconciliation.pollHistory.length
            : 0;
          const summary = r.summary || '';
          const detailId = 'detail-' + j.id.replace(/[^a-z0-9-]/gi, '');
          return (
            '<article class="card" style="margin-bottom: 12px;">' +
              '<div class="job-head">' +
                '<div>' + statusPill(j.status) + ' <span class="meta" style="margin-left:8px;">' + escapeHtml(j.id) + '</span></div>' +
                '<span class="meta">' + escapeHtml(new Date(j.updatedAt).toLocaleString()) + '</span>' +
              '</div>' +
              '<p class="meta" style="margin-top:10px;"><strong>Case</strong> ' + escapeHtml(j.caseFileId) +
                ' · <strong>Proposal</strong> ' + escapeHtml(j.proposalId) +
                ' · <strong>Target</strong> ' + escapeHtml(j.target) +
                ' · <strong>Venue</strong> ' + escapeHtml(j.venue) + '</p>' +
              '<p class="meta"><strong>Directive</strong> ' + escapeHtml(dir) +
                ' · <strong>Chain</strong> ' + escapeHtml(chain) +
                ' · <strong>Status polls</strong> ' + polls + '</p>' +
              '<p class="meta"><strong>normalizedHash</strong><br/><span class="mono">' + escapeHtml(hash) + '</span></p>' +
              '<p class="meta">' + escapeHtml(summary) + '</p>' +
              '<button type="button" class="secondary" data-toggle="' + escapeHtml(detailId) + '">Toggle raw result</button>' +
              '<pre class="raw" id="' + escapeHtml(detailId) + '" style="display:none;"></pre>' +
            '</article>'
          );
        }).join('');

        sorted.forEach((j) => {
          const id = 'detail-' + j.id.replace(/[^a-z0-9-]/gi, '');
          const pre = document.getElementById(id);
          if (pre) pre.textContent = JSON.stringify(j, null, 2);
        });

        jobsRoot.querySelectorAll('[data-toggle]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const tid = btn.getAttribute('data-toggle');
            const el = document.getElementById(tid);
            if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
          });
        });
      }

      async function loadJobs() {
        const res = await fetch('/v1/execution/jobs');
        const data = await res.json();
        const jobs = data.items || [];
        renderStats(jobs);
        renderJobs(jobs);
      }

      async function loadCases() {
        const res = await fetch('/v1/cases');
        const data = await res.json();
        const cases = data.items || [];
        caseSelect.innerHTML = '<option value="">— Select case —</option>' +
          cases.map((c) =>
            '<option value="' + escapeHtml(c.id) + '" data-proposal="' + escapeHtml(c.proposal && c.proposal.proposalId ? c.proposal.proposalId : '') + '">' +
            escapeHtml(c.id) + ' (' + escapeHtml(c.status) + ')' +
            '</option>'
          ).join('');
      }

      caseSelect.addEventListener('change', () => {
        const opt = caseSelect.selectedOptions[0];
        const pid = opt && opt.getAttribute('data-proposal');
        proposalInput.value = pid || '';
      });

      document.getElementById('queue-btn').addEventListener('click', async () => {
        const caseId = caseSelect.value;
        const proposalId = proposalInput.value.trim();
        const directive = directiveEl.value;
        if (!caseId || !proposalId) {
          showBanner('Select a case and ensure proposal ID is set.', false);
          return;
        }
        const res = await fetch('/v1/execution/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId, proposalId, directive }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showBanner('Queue failed: ' + (err.message || res.status), false);
          return;
        }
        showBanner('Job queued.', true);
        await loadJobs();
      });

      document.getElementById('refresh-btn').addEventListener('click', loadJobs);
      document.getElementById('worker-btn').addEventListener('click', async () => {
        const btn = document.getElementById('worker-btn');
        btn.disabled = true;
        try {
          const res = await fetch('/v1/workers/ton/run-once', { method: 'POST' });
          const data = await res.json();
          const n = (data.results && data.results.length) || 0;
          showBanner('Worker finished. Processed ' + n + ' job(s).', res.ok);
          await loadJobs();
        } catch (e) {
          showBanner('Worker request failed.', false);
        } finally {
          btn.disabled = false;
        }
      });

      Promise.all([loadCases(), loadJobs()]).catch(() => {
        jobsRoot.innerHTML = '<p class="meta">Failed to load data. Is the API up?</p>';
      });
    </script>
  </body>
</html>`;
}
