import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function graphiteWebArtifact(): Plugin {
  const outputRoot = resolve(import.meta.dirname, "src/renderer/dist");
  return {
    name: "graphite-web-artifact",
    enforce: "pre",
    async buildStart() {
      await rm(outputRoot, { recursive: true, force: true });
    },
    async closeBundle() {
      const serverDirectory = resolve(outputRoot, "server");
      await mkdir(serverDirectory, { recursive: true });
      await writeFile(
        resolve(serverDirectory, "index.js"),
        [
          "export default {",
          "  async fetch(request, environment) {",
          "    if (!environment.ASSETS) {",
          '      return new Response("Graphite assets are unavailable.", { status: 503 });',
          "    }",
          "    return environment.ASSETS.fetch(request);",
          "  },",
          "};",
          "",
        ].join("\r\n"),
      );
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const web = mode === "web";
  const alias = web
    ? [
        {
          find: /^electrobun\/view$/,
          replacement: resolve(import.meta.dirname, "src/renderer/lib/electrobun-web-stub.ts"),
        },
      ]
    : (await import("./.hutch/devkit/api/config/electrobun-vite")).electrobunViteAliases(
        resolve(import.meta.dirname, ".hutch/devkit"),
      );

  return {
    plugins: [
      react(),
      ...(web
        ? [
            VitePWA({
              registerType: "autoUpdate",
              includeAssets: ["graphite_app.png"],
              manifest: {
                name: "Graphite Markdown Editor",
                short_name: "Graphite",
                description: "A private, local-first Markdown editor for Obsidian vaults.",
                theme_color: "#171717",
                background_color: "#f5f5f5",
                display: "standalone",
                start_url: ".",
                scope: ".",
                icons: [
                  {
                    src: "graphite_app.png",
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "any maskable",
                  },
                ],
              },
              workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ["**/*.{css,html,js,png,svg,woff2}"],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                navigateFallback: "index.html",
              },
            }),
            graphiteWebArtifact(),
            sites(),
          ]
        : []),
    ],
    resolve: { alias },
    root: "src/renderer",
    publicDir: "public",
    base: "./",
    build: {
      outDir: web ? "dist/client" : "../../dist",
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
      strictPort: true,
    },
  };
});
