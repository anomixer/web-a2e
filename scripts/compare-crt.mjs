#!/usr/bin/env node
/*
 * compare-crt.mjs - The native CRT chain against the browser's, pixel by pixel
 *
 * The native app's native/shaders/crt.metal (github.com/mikedaley/applem)
 * is a port of public/shaders/crt.glsl. This takes the pictures its
 * native/tools/crt_render wrote (each source frame, the shader parameters,
 * and what Metal drew), draws the same frames with the same parameters
 * through the browser's own WebGLRenderer in headless Chrome, and reports how
 * far apart the two are. Side-by-side PNGs of each pair, with the difference
 * amplified, go next to them.
 *
 *   (in applem) build-macos/native/crt_render native/shaders/crt.metal <dir>
 *   npm run dev -- --port 3011 --strictPort &
 *   <Chrome> --headless=new --remote-debugging-port=9233 ... &
 *   node scripts/compare-crt.mjs <dir> [http://localhost:3011] [9233]
 *
 * Exits non-zero if any pair differs by more than the tolerance.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dir = process.argv[2];
const pageUrl = process.argv[3] || "http://localhost:3011/";
const cdpPort = process.argv[4] || "9233";
if (!dir) {
  console.error("usage: compare-crt.mjs <dir> [page url] [devtools port]");
  process.exit(2);
}

// A pixel counts as different past this many levels in any channel. Two GPUs
// interpolating the same texture differ by a level or two; a wrong effect
// differs by tens.
const LEVEL_TOLERANCE = 6;
// And a pair fails past this fraction of different pixels.
const PIXEL_TOLERANCE = 0.005;

const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));

// ---------------------------------------------------------------------------
// Chrome over the DevTools protocol, no dependencies
// ---------------------------------------------------------------------------

const tab = await (
  await fetch(`http://localhost:${cdpPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" })
).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let nextId = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (reply.result.exceptionDetails) {
    throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 600));
  }
  return reply.result.result.value;
};
await send("Runtime.enable");
await send("Page.enable");
await new Promise((resolve) => setTimeout(resolve, 3000));

// The browser's renderer, drawing one frame on a canvas of exactly the size
// Metal drew, with time held at zero and no persistence carried over.
const renderInBrowser = (entry, sourceBase64) => `(async () => {
  const { WebGLRenderer } = await import("/src/js/display/webgl-renderer.js");
  const canvas = document.createElement("canvas");
  canvas.width = ${entry.width};
  canvas.height = ${entry.height};
  const renderer = new WebGLRenderer(canvas);
  renderer.width = ${entry.srcWidth};
  renderer.height = ${entry.srcHeight};
  await renderer.init();
  renderer.setParams(${JSON.stringify(entry.params)});
  renderer.setNearestFilter(${entry.sharpPixels});
  const bytes = Uint8Array.from(atob("${sourceBase64}"), (c) => c.charCodeAt(0));
  renderer.updateTexture(bytes);
  renderer.time = 0;
  renderer.draw();
  const gl = renderer.gl;
  const pixels = new Uint8Array(${entry.width} * ${entry.height} * 4);
  gl.readPixels(0, 0, ${entry.width}, ${entry.height}, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  let text = "";
  for (let i = 0; i < pixels.length; i += 0x8000) {
    text += String.fromCharCode.apply(null, pixels.subarray(i, i + 0x8000));
  }
  return btoa(text);
})()`;

// ---------------------------------------------------------------------------
// PNG output, for looking at a pair
// ---------------------------------------------------------------------------

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const writePng = (file, rgba, width, height) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
};

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

let failures = 0;
const rows = [];
for (const entry of manifest) {
  const stem = path.join(dir, `${entry.pattern}.${entry.variant}`);
  const source = fs.readFileSync(`${stem}.src.rgba`);
  const metal = fs.readFileSync(`${stem}.metal.rgba`);
  const flipped = Buffer.from(await evaluate(renderInBrowser(entry, source.toString("base64"))), "base64");

  // WebGL reads from the bottom row up.
  const { width, height } = entry;
  const web = Buffer.alloc(flipped.length);
  for (let y = 0; y < height; y++) {
    flipped.copy(web, y * width * 4, (height - 1 - y) * width * 4, (height - y) * width * 4);
  }

  let maxDiff = 0;
  let sumDiff = 0;
  let differing = 0;
  const diff = Buffer.alloc(web.length);
  for (let i = 0; i < web.length; i += 4) {
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(web[i + c] - metal[i + c]);
      worst = Math.max(worst, d);
      sumDiff += d;
    }
    maxDiff = Math.max(maxDiff, worst);
    if (worst > LEVEL_TOLERANCE) differing++;
    const shown = Math.min(255, worst * 8);
    diff[i] = shown;
    diff[i + 1] = shown;
    diff[i + 2] = shown;
    diff[i + 3] = 255;
  }
  const fraction = differing / (width * height);
  const ok = fraction <= PIXEL_TOLERANCE;
  if (!ok) failures++;
  rows.push({
    pair: `${entry.pattern}.${entry.variant}`,
    max: maxDiff,
    mean: (sumDiff / (width * height * 3)).toFixed(3),
    "differing %": (fraction * 100).toFixed(3),
    ok,
  });

  // Metal, WebGL and the difference, side by side.
  const side = Buffer.alloc(width * 3 * height * 4);
  for (let y = 0; y < height; y++) {
    metal.copy(side, (y * width * 3) * 4, y * width * 4, (y + 1) * width * 4);
    web.copy(side, (y * width * 3 + width) * 4, y * width * 4, (y + 1) * width * 4);
    diff.copy(side, (y * width * 3 + width * 2) * 4, y * width * 4, (y + 1) * width * 4);
  }
  writePng(`${stem}.compare.png`, side, width * 3, height);
}

console.table(rows);
console.log(failures ? `${failures} pair(s) differ` : "Every pair matches");
ws.close();
process.exit(failures ? 1 : 0);
