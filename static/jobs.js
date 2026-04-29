const $ = (id) => document.getElementById(id);

function fmtTs(ts) {
  if (!ts) return "—";
  try { return new Date(ts * 1000).toLocaleString(); } catch { return "—"; }
}

function fmtDuration(startTs, endTs) {
  const start = Number(startTs || 0);
  const end = Number(endTs || 0);
  if (!(start > 0) || !(end >= start)) return "—";
  let secs = Math.round(end - start);
  const d = Math.floor(secs / 86400); secs -= d * 86400;
  const h = Math.floor(secs / 3600); secs -= h * 3600;
  const m = Math.floor(secs / 60); secs -= m * 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
}

function fmtG(g) {
  const n = Number(g || 0);
  if (n >= 100) return `${n.toFixed(0)} g`;
  if (n >= 10) return `${n.toFixed(1)} g`;
  return `${n.toFixed(2)} g`;
}

function recentJobSlotLabel(slotId) {
  const sid = String(slotId || "").toUpperCase();
  if (sid === "SP") return "Spool";
  if (sid === "UNKNOWN" || sid === "UNASSIGNED" || sid === "?") return "Unassigned";
  if (/^[1-4][A-D]$/.test(sid)) return `CFS Box ${sid[0]} · ${sid}`;
  return sid || "—";
}

let currentOffset = 0;
const pageSize = 50;
let currentTotal = 0;

function dateToTs(v, endOfDay = false) {
  if (!v) return "";
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  const ts = Math.floor(d.getTime() / 1000);
  return Number.isFinite(ts) ? String(ts) : "";
}

function currentFilters() {
  return {
    printer_id: $("fPrinter")?.value || "",
    material: $("fMaterial")?.value || "",
    spoolman_id: $("fSpool")?.value || "",
    needs_link: $("fNeedsLink")?.value || "",
    q: $("fQuery")?.value?.trim() || "",
    from_ts: dateToTs($("fFrom")?.value || "", false),
    to_ts: dateToTs($("fTo")?.value || "", true),
  };
}

function buildQuery(filters, offset) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== "" && v != null) p.set(k, String(v));
  }
  p.set("limit", String(pageSize));
  p.set("offset", String(Math.max(0, offset || 0)));
  return p.toString();
}

function fillSelect(sel, values, anyLabel) {
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";
  const any = document.createElement("option");
  any.value = "";
  any.textContent = anyLabel;
  sel.appendChild(any);
  for (const v of values || []) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function renderJobs(items) {
  const wrap = $("jobsList");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("div");
    empty.className = "emptyState";
    empty.textContent = "No jobs match these filters.";
    wrap.appendChild(empty);
    return;
  }

  for (const j of items) {
    const entry = document.createElement("div");
    entry.className = "moonEntry";

    const row = document.createElement("div");
    row.className = "moonRow";
    const left = document.createElement("div");
    left.className = "moonJob";
    left.textContent = `Printer: ${j.printer_id || "—"}${j.job_name ? " · " + j.job_name : ""}`;
    const right = document.createElement("div");
    right.className = "moonNums";
    right.textContent = `${Number(j.total_meters || 0).toFixed(1)} m · ${fmtG(j.total_grams)}`;
    row.appendChild(left);
    row.appendChild(right);
    entry.appendChild(row);

    const sub = document.createElement("div");
    sub.className = "moonSub";
    const flags = [];
    if (j.source === "moonraker_history") flags.push("Recovered while offline");
    if (j.needs_link) flags.push("Needs spool link");
    const suffix = flags.length ? ` · ${flags.join(" · ")}` : "";
    sub.textContent = `Start: ${fmtTs(j.started_at)} · End: ${fmtTs(j.ended_at)} · Print Time: ${fmtDuration(j.started_at, j.ended_at)}${suffix}`;
    entry.appendChild(sub);

    const spoolList = document.createElement("div");
    spoolList.className = "moonSpoolList";
    const spools = Array.isArray(j.spools) ? j.spools : [];
    if (!spools.length) {
      const empty = document.createElement("div");
      empty.className = "moonSpoolEmpty";
      empty.textContent = "No spool usage recorded";
      spoolList.appendChild(empty);
    } else {
      for (const s of spools) {
        const spoolRow = document.createElement("div");
        spoolRow.className = "moonSpoolRow";
        const info = document.createElement("div");
        info.className = "moonSpoolInfo";

        const swatch = document.createElement("span");
        swatch.className = "moonSpoolSwatch";
        const col = String(s.color_hex || "").trim();
        if (/^#[0-9a-fA-F]{6}$/.test(col)) swatch.style.background = col;
        info.appendChild(swatch);

        const textWrap = document.createElement("div");
        textWrap.className = "moonSpoolTextWrap";
        const label = document.createElement("div");
        label.className = "moonSpoolLabel";
        const spoolId = Number(s.spoolman_id || 0);
        const material = String(s.material || "").trim().toUpperCase();
        label.textContent = `${recentJobSlotLabel(s.slot)} · ${spoolId > 0 ? "#" + spoolId : "not linked"}${material ? " · " + material : ""}`;
        const meta = document.createElement("div");
        meta.className = "moonSpoolMeta";
        meta.textContent = `${Number(s.meters || 0).toFixed(2)} m · ${fmtG(Number(s.grams || 0))}`;
        textWrap.appendChild(label);
        textWrap.appendChild(meta);
        info.appendChild(textWrap);
        spoolRow.appendChild(info);
        spoolList.appendChild(spoolRow);
      }
    }

    entry.appendChild(spoolList);
    wrap.appendChild(entry);
  }
}

async function loadJobs(resetOffset = false) {
  if (resetOffset) currentOffset = 0;
  const filters = currentFilters();
  const qs = buildQuery(filters, currentOffset);
  const r = await fetch(`/api/ui/jobs?${qs}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();

  currentTotal = Number(data.total || 0);
  fillSelect($("fPrinter"), (data.options || {}).printers || [], "All printers");
  fillSelect($("fMaterial"), (data.options || {}).materials || [], "All materials");
  renderJobs(data.items || []);

  const from = currentTotal === 0 ? 0 : currentOffset + 1;
  const to = Math.min(currentOffset + pageSize, currentTotal);
  const summary = $("jobsSummary");
  if (summary) summary.textContent = `${from}-${to} of ${currentTotal}`;

  const page = Math.floor(currentOffset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(currentTotal / pageSize));
  const pageInfo = $("pageInfo");
  if (pageInfo) pageInfo.textContent = `Page ${page} / ${pages}`;

  const prev = $("prevPage");
  const next = $("nextPage");
  if (prev) prev.disabled = currentOffset <= 0;
  if (next) next.disabled = (currentOffset + pageSize) >= currentTotal;
}

function init() {
  $("applyFilters")?.addEventListener("click", () => { loadJobs(true).catch(showErr); });
  $("resetFilters")?.addEventListener("click", () => {
    if ($("fPrinter")) $("fPrinter").value = "";
    if ($("fMaterial")) $("fMaterial").value = "";
    if ($("fSpool")) $("fSpool").value = "";
    if ($("fNeedsLink")) $("fNeedsLink").value = "";
    if ($("fFrom")) $("fFrom").value = "";
    if ($("fTo")) $("fTo").value = "";
    if ($("fQuery")) $("fQuery").value = "";
    loadJobs(true).catch(showErr);
  });
  $("prevPage")?.addEventListener("click", () => {
    currentOffset = Math.max(0, currentOffset - pageSize);
    loadJobs(false).catch(showErr);
  });
  $("nextPage")?.addEventListener("click", () => {
    currentOffset += pageSize;
    loadJobs(false).catch(showErr);
  });
}

function showErr(err) {
  const wrap = $("jobsList");
  if (!wrap) return;
  wrap.innerHTML = "";
  const d = document.createElement("div");
  d.className = "emptyState";
  d.textContent = `Failed to load jobs: ${err.message || String(err)}`;
  wrap.appendChild(d);
}

init();
loadJobs(true).catch(showErr);
