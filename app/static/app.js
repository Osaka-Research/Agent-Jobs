// app.js — two-input search, compact list view, with progress feedback.

const $ = (sel) => document.querySelector(sel);

const form = $("#searchForm");
const status = $("#status");
const results = $("#results");
const healthInfo = $("#healthInfo");

let progressTimer = null;
let spinnerTimer = null;

// module-level stash for the most recent gps fix, sent with each search.
// shape: {lat, lng, accuracy} or null when no gps was used.
let lastGeo = null;

// E.164 phone: + followed by 8-15 digits, first digit 1-9 (no leading zeros)
const E164_RE = /^\+[1-9]\d{7,14}$/;
function readPhone() {
  const raw = ($("#phone")?.value || "").trim();
  if (!raw) return null;
  if (!E164_RE.test(raw)) return { error: "phone must be E.164 (e.g. +919876543210)" };
  return { value: raw };
}

// module-level stash for the most recent search_id, used to POST events
// back to /api/admin/event when the user clicks cards.
let currentSearchId = null;

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
      apply.addEventListener("click", (ev) => {
        ev.stopPropagation();
        reportEvent("apply", j);
      });
      expanded.appendChild(apply);
    }

    // download-resume button — generates a .docx with the job info
    // stub for now: title + company + location + description
    const dl = document.createElement("button");
    dl.type = "button";
    dl.className = "download";
    dl.textContent = "Download Resume";
    dl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      reportEvent("resume", j);
      downloadJobDocx(j);
    });
    expanded.appendChild(dl);

    card.appendChild(expanded);

    // toggle handler — entire card is the click target except the apply button
    const toggle = () => {
      const open = card.classList.toggle("open");
      card.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) reportEvent("open", j);
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
  const phoneResult = readPhone();
  if (phoneResult && phoneResult.error) {
    setStatus(phoneResult.error, "error");
    return;
  }
  const phone = phoneResult ? phoneResult.value : null;

  const btn = form.querySelector("button");
  btn.disabled = true;
  startProgress(term);

  try {
    const resp = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search_term: term,
        location: location,
        phone: phone,
        ...(lastGeo ? { geo: lastGeo } : {}),
      }),
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
    currentSearchId = data.search_id || null;
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

// ===== event reporting =====
//
// POST to /api/admin/event when the user takes a meaningful action on a card
// (open / resume / apply). backend increments counters in telegram_sessions
// and edits the persistent session message in place.
// best-effort fire-and-forget — failures are silent (we don't want a 500
// on the event endpoint to break the user's click experience).

function reportEvent(event, job) {
  if (!currentSearchId || !job) return;
  // grab the latest phone value from the input — user may have edited it
  const phoneRaw = ($("#phone")?.value || "").trim();
  const phone = E164_RE.test(phoneRaw) ? phoneRaw : null;
  const body = JSON.stringify({
    search_id: currentSearchId,
    event: event,
    job_id: job.id || null,
    job_title: job.title || null,
    job_company: job.company || null,
    job_url: job.url || null,
    phone: phone,
  });
  // sendBeacon would be more reliable for unload events but fetch keepalive is fine here
  fetch("/api/admin/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
    keepalive: true,
  }).catch(() => {});
}

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

// ===== geolocation: "📍 locate me" button =====
//
// click → navigator.geolocation.getCurrentPosition → reverse-geocode
// lat/lng to a "City, Country" string via bigdatacloud's free client API.
// fills the #location input. no api key needed, 10k/day free tier.

const locateBtn = document.getElementById("locateBtn");
if (locateBtn) {
  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("geolocation not supported on this browser", "error");
      return;
    }
    locateBtn.disabled = true;
    const originalText = locateBtn.textContent;
    locateBtn.textContent = "📍 locating…";
    setStatus("requesting your location…", "loading");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        lastGeo = { lat, lng, accuracy };
        try {
          const city = await reverseGeocode(lat, lng);
          if (city) {
            $("#location").value = city;
            setStatus(`📍 ${city} · ${lat.toFixed(4)},${lng.toFixed(4)} (±${accuracy}m)`, "");
          } else {
            setStatus(`📍 ${lat.toFixed(4)},${lng.toFixed(4)} (±${accuracy}m)`, "");
          }
        } catch (e) {
          setStatus(`📍 ${lat.toFixed(4)},${lng.toFixed(4)} (±${accuracy}m) · geocode failed`, "warn");
        } finally {
          locateBtn.disabled = false;
          locateBtn.textContent = originalText;
        }
      },
      (err) => {
        locateBtn.disabled = false;
        locateBtn.textContent = originalText;
        const msg = err.code === err.PERMISSION_DENIED
          ? "location permission denied"
          : `geolocation error: ${err.message}`;
        setStatus(msg, "error");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

async function reverseGeocode(lat, lng) {
  // bigdatacloud free reverse-geocode-client — no api key required.
  // returns locality + countryName in a single object.
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  // prefer city-level locality; fall back to principalSubdivision
  const city = data.city || data.locality || data.localityInfo?.administrative?.[0]?.name || data.principalSubdivision;
  const country = data.countryName || "";
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  return null;
}

// ===== .docx download =====
//
// Builds a minimal valid .docx (Office Open XML) entirely in the browser.
// a .docx is a zip with [Content_Types].xml, _rels/.rels, and word/document.xml.
// we use a tiny zip-builder (deflate + crc32) — no dependencies.
//
// stub for now: just title + company + location + description.
// later this can be replaced with a real resume generator that pulls
// profile data and tailors content to the job.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// minimal store-only zip writer. no compression — every file stored as-is.
// good enough for small docx files (< 100KB) where compression savings are negligible.
function buildZip(files) {
  // files: [{ name: string, data: Uint8Array }]
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    // local file header (30 bytes + name)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);  // local file header signature
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // method = stored
    lv.setUint16(10, 0, true);          // mod time
    lv.setUint16(12, 0, true);          // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, f.data);

    // central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + f.data.length;
  }

  const localBlobSize = localParts.reduce((s, p) => s + p.length, 0);
  const centralBlobSize = centralParts.reduce((s, p) => s + p.length, 0);
  const centralOffset = localBlobSize;

  // end of central directory record
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralBlobSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  // concatenate everything
  const total = localBlobSize + centralBlobSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of localParts) { out.set(p, pos); pos += p.length; }
  for (const p of centralParts) { out.set(p, pos); pos += p.length; }
  out.set(eocd, pos);
  return out;
}

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeFilename(s) {
  return String(s || "job")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "job";
}

function downloadJobDocx(job) {
  const title = job.title || "(untitled)";
  const company = job.company || "(unknown company)";
  const location = job.location || "";
  const site = job.site || "";
  const description = job.description || "";
  const salary = (job.salary_min || job.salary_max) ? formatSalary(job) : "";
  const url = job.url || "";
  const datePosted = job.date_posted || "";

  const meta = [
    `Company: ${company}`,
    location ? `Location: ${location}` : "",
    site ? `Source: ${site}` : "",
    datePosted ? `Posted: ${datePosted}` : "",
    salary ? `Salary: ${salary}` : "",
    job.is_remote ? "Remote: yes" : "",
    job.job_type ? `Type: ${job.job_type}` : "",
  ].filter(Boolean);

  const enc = new TextEncoder();
  const para = (text, opts = {}) => {
    const style = opts.bold ? `<w:b/><w:bCs/>` : "";
    const size = opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "";
    const rPr = (style || size) ? `<w:rPr>${style}${size}</w:rPr>` : "";
    const txt = text.split("\n").map((line, i, arr) => {
      const br = i < arr.length - 1 ? `<w:br/>` : "";
      return `<w:t xml:space="preserve">${xmlEscape(line)}${br ? "" : ""}</w:t>${br}`;
    }).join("");
    return `<w:p><w:r>${rPr}${txt}</w:r></w:p>`;
  };

  const metaParas = meta.map((m) => para(m)).join("");

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
        para(title, { bold: true, size: "32" }) +
        para(company, { bold: true, size: "24" }) +
        (location ? para(location) : "") +
        metaParas +
        (url ? para(`Source: ${url}`) : "") +
        para("") +
        para("Job Description", { bold: true, size: "24" }) +
        (description ? para(description) : para("(no description provided)")) +
        para("") +
        para("— Generated by Agent Jobs —", { size: "18" }) +
        `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
      `</w:body>` +
    `</w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const files = [
    { name: "[Content_Types].xml",   data: enc.encode(contentTypes) },
    { name: "_rels/.rels",            data: enc.encode(rels) },
    { name: "word/document.xml",      data: enc.encode(documentXml) },
  ];
  const zipBytes = buildZip(files);

  const filename = `${sanitizeFilename(title)}-${sanitizeFilename(company)}.docx`;
  const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url2;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url2), 1000);
}
