import { describe, expect, it } from "vitest";

import { notADiskImage } from "../../../src/js/disk-manager/library-image.js";

const bytes = (text, size = 2048) => {
  const data = new Uint8Array(size);
  data.set(new TextEncoder().encode(text));
  return data;
};

describe("notADiskImage", () => {
  it("accepts a disk-sized run of bytes", () => {
    expect(notADiskImage(new Uint8Array(143360), "application/octet-stream")).toBeNull();
    expect(notADiskImage(new Uint8Array(143360), null)).toBeNull();
  });

  it("refuses a web page sent in place of the disk", () => {
    expect(notADiskImage(new Uint8Array(143360), "text/html; charset=utf-8")).toMatch(/web page/);
    expect(notADiskImage(bytes("<!DOCTYPE html><html>"), null)).toMatch(/web page/);
    expect(notADiskImage(bytes("\n  <html lang=en>"), "application/octet-stream")).toMatch(/web page/);
  });

  it("refuses something too small to be a disk", () => {
    expect(notADiskImage(new Uint8Array(12))).toMatch(/12 bytes/);
    expect(notADiskImage(null)).toMatch(/0 bytes/);
  });
});
