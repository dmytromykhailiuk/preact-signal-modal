import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
