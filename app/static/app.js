// app.js — two-input search, compact list view.

const $ = (sel) => document.querySelector(sel);

const form = $("#searchForm");
const status = $("#status");
const results = $("#results");
const healthInfo = $("#healthInfo");

function setStatus(text, level = "") {
  status.textContent = text;
  status.className = level;
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
  setStatus(`searching "${term}"…`, "loading");

  try {
    const resp = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search_term: term, location: location }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      setStatus(`error ${resp.status}: ${txt}`, "error");
      results.innerHTML = "";
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      setStatus(`failed: ${data.message || data.error || "unknown"}`, "error");
      results.innerHTML = "";
      return;
    }
    setStatus(`${data.count} jobs`, "");
    renderJobs(data.jobs);
  } catch (e) {
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
