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
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-expanded", "false");

    // header row: title (left) + caret + salary (right)
    const header = document.createElement("div");
    header.className = "header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "title-wrap";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = j.title || "(untitled)";
    titleWrap.appendChild(title);

    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = "▸";
    titleWrap.appendChild(caret);

    header.appendChild(titleWrap);

    if (j.salary_min || j.salary_max) {
      const sal = document.createElement("span");
      sal.className = "salary";
      sal.textContent = formatSalary(j);
      header.appendChild(sal);
    }

    card.appendChild(header);

    // collapsed-view meta (company · location · date)
    const meta = document.createElement("div");
    meta.className = "meta";
    const metaParts = [];
    if (j.company) metaParts.push(escapeHtml(j.company));
    if (j.location) metaParts.push(escapeHtml(j.location));
    if (j.date_posted) metaParts.push(escapeHtml(j.date_posted));
    meta.innerHTML = metaParts.join('<span class="sep">·</span>');
    card.appendChild(meta);

    // expanded panel (hidden until click)
    const expanded = document.createElement("div");
    expanded.className = "expanded";

    if (j.description) {
      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = j.description;
      expanded.appendChild(desc);
    } else {
      const nodata = document.createElement("div");
      nodata.className = "desc nodata";
      nodata.textContent = "(no description provided by the source)";
      expanded.appendChild(nodata);
    }

    // expanded meta detail (site, job type, remote, interval)
    const detailRows = [];
    if (j.site) detailRows.push(["source", j.site]);
    if (j.job_type) detailRows.push(["type", j.job_type]);
    if (j.is_remote) detailRows.push(["remote", "yes"]);
    if (j.salary_min || j.salary_max) detailRows.push(["salary", formatSalary(j)]);
    if (detailRows.length) {
      const dl = document.createElement("dl");
      dl.className = "detail";
      for (const [k, v] of detailRows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      expanded.appendChild(dl);
    }

    if (j.url) {
      const apply = document.createElement("a");
      apply.className = "apply";
      apply.href = j.url;
      apply.target = "_blank";
      apply.rel = "noopener noreferrer";
      apply.textContent = "apply on " + (j.site || "source") + " →";
      // stop card-toggle when clicking the apply button
      apply.addEventListener("click", (ev) => ev.stopPropagation());
      expanded.appendChild(apply);
    }

    card.appendChild(expanded);

    // toggle handler — entire card is the click target except the apply button
    const toggle = () => {
      const open = card.classList.toggle("open");
      card.setAttribute("aria-expanded", open ? "true" : "false");
    };
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });

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

// populate the location datalist with the curated ~320-entry world list.
// loaded once on page load, cached by the browser thereafter.
(async () => {
  try {
    const r = await fetch("/static/locations.json");
    if (!r.ok) return;
    const list = await r.json();
    const dl = document.getElementById("locations");
    if (!dl) return;
    const frag = document.createDocumentFragment();
    for (const loc of list) {
      const opt = document.createElement("option");
      opt.value = loc;
      frag.appendChild(opt);
    }
    dl.appendChild(frag);
  } catch {}
})();
