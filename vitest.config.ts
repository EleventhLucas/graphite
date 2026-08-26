import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [".hutch/**", ".tmp-electrobun/**", "node_modules/**", "dist/**", "build/**"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
