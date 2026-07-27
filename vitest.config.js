import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.js: the app build config carries
// manualChunks and asset rules that have nothing to do with the test run, and
// merging the two makes failures harder to read.
export default defineConfig({
  test: {
    include: ["tests/js/**/*.test.js"],
    // The printer emulation and the other modules under test are pure logic —
    // no DOM, no canvas — so plain node is enough. Anything that grows a DOM
    // dependency should be treated as a smell rather than a reason to add jsdom.
    environment: "node",
  },
});
