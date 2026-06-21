/*
 * print-browser-window.js - Browse, preview, export, reprint, and delete the
 * pages captured by the virtual printer.
 *
 * Pages are auto-saved to IndexedDB by printer-window.js (printer-page-store.js)
 * so output survives a tab close. This window is a read/manage view over that
 * store: a thumbnail list grouped by print job on the left, a preview on the
 * right. Selecting a job header previews the whole continuous paper track and
 * reprints the entire job; selecting a single page previews and exports just
 * that page. Reprint reuses the printer window's full-bleed page sizing
 * (print-utils.js). Styled with the shared control tokens so it matches the
 * Printer window's look and feel.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BaseWindow } from "../windows/base-window.js";
import { getAllPages, deletePage, deleteJob } from "./printer-page-store.js";
import { printPagesViaIframe, printImageViaIframe } from "./print-utils.js";
import { makeZipStore } from "./zip-store.js";
import { showConfirm } from "../ui/confirm.js";

// Decode a PNG data URL to its raw bytes (for zipping stored pages).
function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}


function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export class PrintBrowserWindow extends BaseWindow {
  constructor(printerWindow = null) {
    super({
      id: "print-browser",
      title: "Print Browser",
      minWidth: 420,
      minHeight: 320,
      defaultWidth: 780,
      defaultHeight: 560,
    });
    this._printerWindow = printerWindow;   // for "Send to Printer" (load job back)
    this._pages = [];
    this._sel   = { kind: null };   // { kind:'job', jobId } | { kind:'page', id }
  }

  renderContent() {
    return `
      <style>
        .pb-root { display:flex; flex-direction:column; height:100%; box-sizing:border-box; color:var(--text-secondary); font-family:var(--font-mono); }
        .pb-toolbar { display:flex; align-items:center; gap:6px; padding:4px 8px; background:var(--input-bg-dark); border-bottom:1px solid var(--border-default); flex-shrink:0; }
        .pb-btn { padding:2px 8px; font-size:11px; border:1px solid var(--border-default); border-radius:3px; background:var(--badge-dim-bg); color:var(--text-secondary); cursor:pointer; font-family:var(--font-mono); flex-shrink:0; }
        .pb-btn:hover { background:var(--control-bg-hover); color:var(--text-primary); }
        .pb-btn:disabled { opacity:0.4; cursor:default; }
        .pb-btn-danger { color:var(--accent-red); border-color:var(--accent-red-border); }
        .pb-btn-danger:hover { background:var(--accent-red-bg); color:var(--accent-red); }
        .pb-count { margin-left:auto; font-size:11px; color:var(--text-muted); }
        .pb-body { display:flex; flex:1; min-height:0; }
        .pb-list { width:236px; flex:0 0 236px; overflow-y:auto; padding:6px; border-right:1px solid var(--border-default); background:var(--bg-panel); }
        .pb-job { margin-bottom:12px; }
        .pb-job-head { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-muted); padding:3px 5px; border:1px solid transparent; border-radius:3px; cursor:pointer; }
        .pb-job-head:hover { background:var(--control-bg-hover); color:var(--text-secondary); }
        .pb-job-head.sel { color:var(--accent-green); border-color:var(--accent-green); background:var(--accent-green-bg); }
        .pb-job-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pb-thumbs { padding:4px 0 0 6px; }
        .pb-thumb { display:flex; gap:8px; align-items:center; padding:4px; border:1px solid transparent; border-radius:3px; cursor:pointer; }
        .pb-thumb:hover { background:var(--control-bg-hover); }
        .pb-thumb.sel { border-color:var(--accent-green); background:var(--accent-green-bg); }
        .pb-thumb img { width:42px; height:auto; max-height:56px; background:#fff; border:1px solid var(--border-default); }
        .pb-thumb-cap { font-size:11px; line-height:1.35; color:var(--text-secondary); }
        .pb-preview { flex:1; min-width:0; display:flex; flex-direction:column; padding:8px 10px; gap:8px; }
        .pb-actions { display:flex; gap:6px; flex-wrap:wrap; flex-shrink:0; }
        .pb-actions .pb-spacer { margin-left:auto; }
        .pb-meta { font-size:11px; color:var(--text-muted); flex-shrink:0; }
        .pb-stage { flex:1; min-height:0; overflow:auto; background:var(--canvas-bg); border:1px solid var(--border-default); border-radius:3px; padding:10px; }
        .pb-stage img { display:block; margin:0 auto 8px; max-width:100%; height:auto; background:#fff; box-shadow:0 1px 6px rgba(0,0,0,0.35); }
        .pb-stage img:last-child { margin-bottom:0; }
        .pb-empty { margin:auto; color:var(--text-muted); font-size:12px; text-align:center; }
      </style>
      <div class="pb-root">
        <div class="pb-toolbar">
          <button id="pb-refresh" class="pb-btn">Refresh</button>
          <span id="pb-count" class="pb-count"></span>
        </div>
        <div class="pb-body">
          <div id="pb-list" class="pb-list"></div>
          <div id="pb-preview" class="pb-preview">
            <div class="pb-empty">No page selected</div>
          </div>
        </div>
      </div>`;
  }

  onContentRendered() {
    this._list    = this.contentElement.querySelector("#pb-list");
    this._preview = this.contentElement.querySelector("#pb-preview");
    this._count   = this.contentElement.querySelector("#pb-count");

    this.contentElement.querySelector("#pb-refresh")
      .addEventListener("click", () => this._refresh());

    // Keep keystrokes inside the window from leaking to the emulator.
    this.contentElement.addEventListener("keydown", (e) => e.stopPropagation());
    this.contentElement.addEventListener("keyup",   (e) => e.stopPropagation());

    this._refresh();
  }

  // Reload from the store every time the window is shown so freshly printed
  // pages appear without a manual refresh.
  show() {
    super.show();
    this._refresh();
  }

  async _refresh() {
    this._pages = await getAllPages();
    if (this._count) {
      const n = this._pages.length;
      this._count.textContent = n ? `${n} page${n === 1 ? "" : "s"}` : "no pages";
    }
    this._renderList();
    this._renderPreview();
  }

  // Group pages by jobId, newest job first.
  _groupJobs() {
    const jobs = [];
    for (const page of this._pages) {
      let job = jobs.find((j) => j.jobId === page.jobId);
      if (!job) {
        job = { jobId: page.jobId, pages: [] };
        jobs.push(job);
      }
      job.pages.push(page);
    }
    jobs.sort((a, b) => b.jobId - a.jobId);
    return jobs;
  }

  _renderList() {
    if (!this._list) return;
    if (!this._pages.length) {
      this._list.innerHTML = `<div class="pb-empty">Nothing printed yet</div>`;
      return;
    }
    this._list.innerHTML = "";
    for (const job of this._groupJobs()) {
      const first = job.pages[0];
      const section = document.createElement("div");
      section.className = "pb-job";

      const jobSel = this._sel.kind === "job" && this._sel.jobId === job.jobId;
      const head = document.createElement("div");
      head.className = "pb-job-head" + (jobSel ? " sel" : "");
      const when = new Date(first.savedAt).toLocaleString();
      head.innerHTML =
        `<span class="pb-job-title">${this._esc(first.model)} · ${when} · ` +
        `${job.pages.length}pg</span>`;
      head.title = "Preview / print the whole job";
      head.addEventListener("click", () => {
        this._sel = { kind: "job", jobId: job.jobId };
        this._renderList();
        this._renderPreview();
      });
      section.appendChild(head);

      const thumbs = document.createElement("div");
      thumbs.className = "pb-thumbs";
      for (const page of job.pages) {
        const pageSel = this._sel.kind === "page" && this._sel.id === page.id;
        const card = document.createElement("div");
        card.className = "pb-thumb" + (pageSel ? " sel" : "");
        card.innerHTML =
          `<img src="${page.pngDataUrl}" alt="page ${page.pageIndex + 1}"/>` +
          `<span class="pb-thumb-cap">Page ${page.pageIndex + 1} / ${page.pageCount}<br>` +
          `${this._esc(page.ribbon)} · ${this._pageSizeLabel(page)}</span>`;
        card.addEventListener("click", () => {
          this._sel = { kind: "page", id: page.id };
          this._renderList();
          this._renderPreview();
        });
        thumbs.appendChild(card);
      }
      section.appendChild(thumbs);
      this._list.appendChild(section);
    }
  }

  _renderPreview() {
    if (!this._preview) return;
    if (this._sel.kind === "job") {
      const job = this._groupJobs().find((j) => j.jobId === this._sel.jobId);
      if (job) return this._renderJobPreview(job);
    } else if (this._sel.kind === "page") {
      const page = this._pages.find((p) => p.id === this._sel.id);
      if (page) return this._renderPagePreview(page);
    }
    this._sel = { kind: null };
    this._preview.innerHTML = `<div class="pb-empty">Select a job header to preview the whole run, or a page to preview it on its own</div>`;
  }

  // 72-dpi display width for a page PNG (canvas px → physical inches → 72dpi screen px).
  _imgDisplayW(page) { return Math.round((page.width || 960) * 72 / 120); }

  // Whole job: the continuous paper track (every page stacked) + job actions.
  _renderJobPreview(job) {
    const first = job.pages[0];
    const when  = new Date(first.savedAt).toLocaleString();
    const imgs  = job.pages
      .map((p) => `<img src="${p.pngDataUrl}" style="width:${this._imgDisplayW(p)}px" alt="page ${p.pageIndex + 1}"/>`).join("");
    this._preview.innerHTML = `
      <div class="pb-actions">
        <button id="pb-print" class="pb-btn">Print Job…</button>
        <button id="pb-zip" class="pb-btn">Export PNG</button>
        <button id="pb-send" class="pb-btn">Back to ${this._esc(first.model)} ${first.ribbon === "color" ? "Color" : "B/W"}</button>
        <button id="pb-del-job" class="pb-btn pb-btn-danger pb-spacer">Delete Job</button>
      </div>
      <div class="pb-meta">
        ${this._esc(first.model)} · ${job.pages.length} page${job.pages.length === 1 ? "" : "s"} ·
        ${this._esc(first.ribbon)} ribbon · ${this._pageSizeLabel(first)} · ${when}
      </div>
      <div class="pb-stage">${imgs}</div>`;
    this._preview.querySelector("#pb-print").addEventListener("click", () => this._printJob(job));
    this._preview.querySelector("#pb-zip").addEventListener("click", () => this._exportJob(job));
    this._preview.querySelector("#pb-send").addEventListener("click", () => this._sendToPrinter(job));
    this._preview.querySelector("#pb-del-job").addEventListener("click", () => this._deleteJob(job.jobId));
  }

  // Single page: just that sheet + per-page actions (export is page-only).
  _renderPagePreview(page) {
    const when = new Date(page.savedAt).toLocaleString();
    this._preview.innerHTML = `
      <div class="pb-actions">
        <button id="pb-print" class="pb-btn">Print Page…</button>
        <button id="pb-png" class="pb-btn">Export PNG</button>
        <button id="pb-del" class="pb-btn pb-btn-danger pb-spacer">Delete Page</button>
      </div>
      <div class="pb-meta">
        ${this._esc(page.model)} · page ${page.pageIndex + 1} of ${page.pageCount} ·
        ${this._esc(page.ribbon)} ribbon · ${this._pageSizeLabel(page)} · ${when}
      </div>
      <div class="pb-stage"><img src="${page.pngDataUrl}" style="width:${this._imgDisplayW(page)}px" alt="printed page"/></div>`;
    this._preview.querySelector("#pb-print").addEventListener("click", () => this._printPage(page));
    this._preview.querySelector("#pb-png").addEventListener("click", () => this._exportPage(page));
    this._preview.querySelector("#pb-del").addEventListener("click", () => this._deletePage(page));
  }

  // Whole job, full-bleed, one sheet per page (same layout as the printer
  // window's PDF export).
  _printJob(job) {
    const first = job.pages[0];
    printPagesViaIframe(
      job.pages.map((p) => p.pngDataUrl),
      first.width / 120,
      first.formInches,
    );
  }

  _printPage(page) {
    printImageViaIframe(page.pngDataUrl, page.width / 120, page.formInches);
  }

  // Re-load the whole job onto the virtual printer's paper — re-preview it there,
  // or carry on printing onto it. The printer window restores the model/ribbon/
  // form and the head position the job left off at, and re-adopts the job's id.
  _sendToPrinter(job) {
    this._printerWindow?.loadJobToPaper?.(job);
  }

  // Whole job → one PNG per page (page-01.png, page-02.png, …) plus a joined
  // full.png strip, zipped — the same export the printer window produces for a
  // multi-page run. A single-page job exports as a plain PNG (no zip), matching
  // the printer window's behaviour.
  async _exportJob(job) {
    if (job.pages.length === 1) {
      const p = job.pages[0];
      return saveBlob(new Blob([dataUrlToBytes(p.pngDataUrl)], { type: "image/png" }),
        `print-${job.jobId}.png`);
    }
    const pad   = (n) => String(n).padStart(2, "0");
    const files = job.pages.map((p, i) =>
      ({ name: `page-${pad(i + 1)}.png`, data: dataUrlToBytes(p.pngDataUrl) }));

    // full.png — every page stacked into one tall strip (printshop/banner use).
    const w = job.pages[0].width;
    const h = job.pages[0].height;
    const full = document.createElement("canvas");
    full.width  = w;
    full.height = h * job.pages.length;
    const ctx = full.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, full.width, full.height);
    for (let i = 0; i < job.pages.length; i++) {
      ctx.drawImage(await loadImage(job.pages[i].pngDataUrl), 0, i * h);
    }
    const fullBytes = await new Promise((resolve) =>
      full.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), "image/png"));
    files.push({ name: "full.png", data: fullBytes });

    saveBlob(makeZipStore(files), `print-${job.jobId}.zip`);
  }

  _exportPage(page) {
    const a = document.createElement("a");
    a.href = page.pngDataUrl;
    a.download = `print-${page.jobId}-p${String(page.pageIndex + 1).padStart(2, "0")}.png`;
    a.click();
  }

  async _deletePage(page) {
    if (!(await showConfirm(`Delete page ${page.pageIndex + 1} of this print job?`, "Delete"))) return;
    await deletePage(page.id);
    if (this._sel.kind === "page" && this._sel.id === page.id) this._sel = { kind: null };
    this._refresh();
  }

  async _deleteJob(jobId) {
    const job = this._groupJobs().find((j) => j.jobId === jobId);
    const n   = job ? job.pages.length : 0;
    if (!(await showConfirm(`Delete this print job (${n} page${n === 1 ? "" : "s"})?`, "Delete"))) return;
    await deleteJob(jobId);
    if (this._sel.kind === "job" && this._sel.jobId === jobId) this._sel = { kind: null };
    this._refresh();
  }

  _pageSizeLabel(rec) {
    const h = rec.formInches?.toFixed(1) ?? "?";
    const w = rec.paperWidthInch != null ? rec.paperWidthInch.toFixed(1) : null;
    return w ? `${w}×${h}"` : `${h}" form`;
  }

  _esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
