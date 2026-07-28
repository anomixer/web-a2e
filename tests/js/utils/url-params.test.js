/*
 * url-params.test.js - Tests for media parameters read from the page URL
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import {
  parseMediaParams,
  resolveMediaUrl,
  filenameFromUrl,
  hasMediaParams,
  looksLikeLocalPath,
} from "../../../src/js/utils/url-params.js";

const BASE = "https://emulator.example/index.html";

const parse = (search) => parseMediaParams(search, BASE);

describe("resolveMediaUrl", () => {
  it("accepts absolute http and https URLs", () => {
    expect(resolveMediaUrl("https://host/a.dsk", BASE)).toBe("https://host/a.dsk");
    expect(resolveMediaUrl("http://host/a.dsk", BASE)).toBe("http://host/a.dsk");
  });

  it("resolves a relative path against the page", () => {
    expect(resolveMediaUrl("/demos/a.dsk", BASE)).toBe(
      "https://emulator.example/demos/a.dsk",
    );
  });

  it("preserves the query string, which some hosts need", () => {
    expect(resolveMediaUrl("https://host/download?id=abc", BASE)).toBe(
      "https://host/download?id=abc",
    );
  });

  // These come from links other people hand out, so the scheme is not the
  // link author's to choose freely.
  it.each([
    ["javascript:alert(1)"],
    ["data:application/octet-stream;base64,AAAA"],
    ["file:///etc/passwd"],
    ["blob:https://host/1234"],
  ])("rejects %s", (raw) => {
    expect(resolveMediaUrl(raw, BASE)).toBeNull();
  });

  it("rejects empty and non-string values", () => {
    expect(resolveMediaUrl("", BASE)).toBeNull();
    expect(resolveMediaUrl("   ", BASE)).toBeNull();
    expect(resolveMediaUrl(null, BASE)).toBeNull();
  });
});

describe("filenameFromUrl", () => {
  it("takes the basename from the path", () => {
    expect(filenameFromUrl("https://host/games/lode%20runner.dsk")).toBe(
      "lode runner.dsk",
    );
  });

  it("falls back when the URL carries no filename", () => {
    expect(filenameFromUrl("https://host/download?id=abc", undefined, "URL Disk")).toBe(
      "URL Disk",
    );
  });

  it("prefers an explicit override", () => {
    expect(filenameFromUrl("https://host/download?id=abc", "demo.woz")).toBe(
      "demo.woz",
    );
  });

  it("strips any path from the override", () => {
    expect(filenameFromUrl("https://host/x", "../../etc/demo.dsk")).toBe("demo.dsk");
  });
});

describe("looksLikeLocalPath", () => {
  // These resolve as relative URLs and the dev server answers with its own
  // index.html, so without this the failure reads as a corrupt disk image.
  it.each([
    ["/Users/me/Downloads/demo.dsk"],
    ["/home/me/demo.dsk"],
    ["/root/demo.dsk"],
    ["/tmp/demo.dsk"],
    ["/C:/disks/demo.dsk"],
  ])("recognises %s as a local path", (path) => {
    expect(looksLikeLocalPath(new URL(path, BASE).href)).toBe(true);
  });

  it("leaves ordinary web paths alone", () => {
    expect(looksLikeLocalPath("https://emulator.example/disks/demo.dsk")).toBe(false);
    expect(looksLikeLocalPath("https://host/games/a.dsk")).toBe(false);
  });
});

describe("parseMediaParams", () => {
  it("returns nothing for a bare URL", () => {
    const parsed = parse("");
    expect(hasMediaParams(parsed)).toBe(false);
    expect(parsed.errors).toEqual([]);
  });

  it("maps each parameter to its unit", () => {
    const parsed = parse(
      "?disk=https://host/a.dsk&disk2=https://host/b.dsk" +
        "&hd=https://host/c.2mg&hd2=https://host/d.2mg",
    );

    expect(parsed.floppies).toEqual([
      { unit: 0, url: "https://host/a.dsk", filename: "a.dsk" },
      { unit: 1, url: "https://host/b.dsk", filename: "b.dsk" },
    ]);
    expect(parsed.hardDrives).toEqual([
      { unit: 0, url: "https://host/c.2mg", filename: "c.2mg" },
      { unit: 1, url: "https://host/d.2mg", filename: "d.2mg" },
    ]);
  });

  it("treats disk1 as a synonym for disk", () => {
    expect(parse("?disk1=https://host/a.dsk").floppies).toEqual([
      { unit: 0, url: "https://host/a.dsk", filename: "a.dsk" },
    ]);
  });

  it("loads drive 1 once when both disk and disk1 are given", () => {
    const parsed = parse("?disk=https://host/a.dsk&disk1=https://host/b.dsk");
    expect(parsed.floppies).toEqual([
      { unit: 0, url: "https://host/a.dsk", filename: "a.dsk" },
    ]);
  });

  it("reports an unusable URL and keeps the rest of the link working", () => {
    const parsed = parse("?disk=javascript:alert(1)&disk2=https://host/b.dsk");

    expect(parsed.floppies).toEqual([
      { unit: 1, url: "https://host/b.dsk", filename: "b.dsk" },
    ]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatch(/\?disk=/);
  });

  it("applies name when a single image is loaded", () => {
    const parsed = parse("?disk=https://host/download?id=abc&name=demo.woz");
    expect(parsed.floppies[0].filename).toBe("demo.woz");
    expect(parsed.errors).toEqual([]);
  });

  // One name cannot describe two images, and guessing wrong would put a
  // misleading label on a drive.
  it("ignores name when several images are loaded", () => {
    const parsed = parse(
      "?disk=https://host/a.dsk&disk2=https://host/b.dsk&name=demo.woz",
    );

    expect(parsed.floppies.map((f) => f.filename)).toEqual(["a.dsk", "b.dsk"]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatch(/\?name=/);
  });

  it("ignores parameters it does not recognise", () => {
    const parsed = parse("?theme=dark&speed=warp");
    expect(hasMediaParams(parsed)).toBe(false);
    expect(parsed.errors).toEqual([]);
  });
});
