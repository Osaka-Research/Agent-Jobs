// app.js — two-input search, compact list view, with progress feedback.

const $ = (sel) => document.querySelector(sel);

const form = $("#searchForm");
const status = $("#status");
const results = $("#results");
const healthInfo = $("#healthInfo");

let progressTimer = null;
let spinnerTimer = null;

function setStatus(text, level = "") {
  status.textContent = text;
  status.className = level;
}

// spinner: cycles through "⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏" so something is always moving
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinIdx = 0;
function startSpinner(baseText) {
  stopSpinner();
  spinIdx = 0;
  spinnerTimer = setInterval(() => {
    status.textContent = `${SPINNER[spinIdx % SPINNER.length]} ${baseText}`;
    spinIdx++;
  }, 80);
}
function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
  }
}

// rotating progress messages — timed pseudo-stages so the status line
// keeps changing even while the backend is mid-scrape. timing is empirical:
// jobspy with 3 sites typically finishes 30-60s, but can hit 90s timeout.
function startProgress(term) {
  stopProgress();
  const stages = [
    { ms: 0,    text: `connecting to job boards for "${term}"` },
    { ms: 3000, text: "scanning linkedin…" },
    { ms: 12000, text: "scanning indeed…" },
    { ms: 25000, text: "scanning glassdoor…" },
    { ms: 45000, text: "almost there, deduping results…" },
    { ms: 70000, text: "taking longer than usual — backend timeout is 90s" },
  ];
  let i = 0;
  startSpinner(stages[0].text);
  progressTimer = setInterval(() => {
    i++;
    if (i < stages.length) {
      stopSpinner();
      startSpinner(stages[i].text);
    }
  }, stages[Math.min(i + 1, stages.length - 1)].ms - stages[i].ms);
}
function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  stopSpinner();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatSalary(j) {
  const fmt = (n) => {
    if (n == null) return "";
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  const cur = j.salary_currency || "";
  const iv = j.interval ? `/${j.interval}` : "";
  if (j.salary_min && j.salary_max) {
    return `${cur} ${fmt(j.salary_min)}-${fmt(j.salary_max)}${iv}`;
  }
  return `${cur} ${fmt(j.salary_min || j.salary_max)}${iv}`;
}

function renderJobs(jobs) {
  results.innerHTML = "";
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "no jobs matched.";
    results.appendChild(empty);
    return;
  }
  for (const j of jobs) {
    const card = document.createElement("article");
    card.className = "job";

    const a = document.createElement("a");
    a.className = "title";
    a.href = j.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = j.title || "(untitled)";
    card.appendChild(a);

    if (j.salary_min || j.salary_max) {
      const sal = document.createElement("span");
      sal.className = "salary";
      sal.textContent = formatSalary(j);
      card.appendChild(sal);
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    const parts = [];
    if (j.company) parts.push(escapeHtml(j.company));
    if (j.location) parts.push(escapeHtml(j.location));
    if (j.date_posted) parts.push(escapeHtml(j.date_posted));
    meta.innerHTML = parts.join('<span class="sep">·</span>');
    card.appendChild(meta);

    results.appendChild(card);
  }
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const term = $("#searchTerm").value.trim();
  const location = $("#location").value.trim();
  if (!term) {
    setStatus("role is required", "error");
    return;
  }

  const btn = form.querySelector("button");
  btn.disabled = true;
  startProgress(term);

  try {
    const resp = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search_term: term, location: location }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      stopProgress();
      setStatus(`error ${resp.status}: ${txt}`, "error");
      results.innerHTML = "";
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      stopProgress();
      setStatus(`failed: ${data.message || data.error || "unknown"}`, "error");
      results.innerHTML = "";
      return;
    }
    stopProgress();
    setStatus(`✓ ${data.count} jobs`, "");
    renderJobs(data.jobs);
  } catch (e) {
    stopProgress();
    setStatus(`network error: ${e.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

// fetch health on load for footer info
(async () => {
  try {
    const r = await fetch("/api/health");
    if (r.ok) {
      const h = await r.json();
      healthInfo.textContent = `v${h.version}`;
    }
  } catch {}
})();
