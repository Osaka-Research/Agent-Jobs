// app.js — vanilla, no deps. POSTs to /api/scrape, renders results.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const form = $("#searchForm");
const status = $("#status");
const results = $("#results");
const healthInfo = $("#healthInfo");

function setStatus(text, level = "") {
  status.textContent = text;
  status.className = level;
}

function renderJobs(jobs) {
  results.innerHTML = "";
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "no jobs matched. broaden the search or increase hours_old.";
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

    const meta = document.createElement("div");
    meta.className = "meta";
    const parts = [];
    if (j.company) parts.push(`<span>${escapeHtml(j.company)}</span>`);
    if (j.location) parts.push(`<span>${escapeHtml(j.location)}</span>`);
    if (j.site) parts.push(`<span>[${escapeHtml(j.site)}]</span>`);
    if (j.is_remote) parts.push(`<span>remote</span>`);
    if (j.date_posted) parts.push(`<span>${escapeHtml(j.date_posted)}</span>`);
    if (j.salary_min && j.salary_max) {
      parts.push(`<span class="salary">${formatSalary(j)}</span>`);
    }
    meta.innerHTML = parts.join("");
    card.appendChild(meta);

    if (j.description) {
      const desc = document.createElement("div");
      desc.className = "desc collapsed";
      desc.textContent = j.description;
      desc.addEventListener("click", () => desc.classList.toggle("collapsed"));
      card.appendChild(desc);
    }

    results.appendChild(card);
  }
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const term = $("#searchTerm").value.trim();
  const location = $("#location").value.trim();
  const sites = $$('#sitesField input[type="checkbox"]:checked').map((c) => c.value);
  const hoursOld = parseInt($("#hoursOld").value, 10) || 168;
  const limit = parseInt($("#limit").value, 10) || 50;

  if (!term) {
    setStatus("search term is required", "error");
    return;
  }
  if (!sites.length) {
    setStatus("pick at least one site", "error");
    return;
  }

  const btn = form.querySelector("button");
  btn.disabled = true;
  setStatus(`scraping "${term}" from ${sites.join(", ")}…`, "loading");

  try {
    const resp = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search_term: term,
        location: location,
        sites: sites,
        hours_old: hoursOld,
        results_wanted: limit,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      setStatus(`error ${resp.status}: ${txt}`, "error");
      results.innerHTML = "";
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      setStatus(`scrape failed: ${data.message || data.error || "unknown"}`, "error");
      results.innerHTML = "";
      return;
    }
    setStatus(`${data.count} jobs · sites: ${data.sites.join(", ")} · within ${data.hours_old}h`, "");
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
      healthInfo.textContent = `v${h.version} · sites: ${h.sites_default.join(", ")} · timeout: ${h.timeout_default_s}s`;
    }
  } catch {}
})();
