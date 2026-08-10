import { writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";
import { MODAL_CSS } from "./src/styles";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  external: [
    "preact",
    "preact/hooks",
    "preact/jsx-runtime",
    "@preact/signals",
    "@preact/signals-core",
  ],
  // The stylesheet has a single source of truth — `MODAL_CSS` in src/styles.ts,
  // which the runtime injects. Ship the very same bytes as a file so apps that
  // opt out of injection (`configureModal({ injectStyles: false })`, strict CSP,
  // SSR) can import "@dmytromykhailiuk/preact-signal-modal/styles.css" instead.
  async onSuccess() {
    await writeFile("dist/styles.css", MODAL_CSS);
  },
});
