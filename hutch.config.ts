export default {
  packageManager: "bun",
  scripts: {
    install: ["hutch", "pm", "ci"],
    prepare: "hutch electrobun prepare",
    "build:renderer": "hutch electrobun prepare && hutch pm exec -- vite build",
    start: "hutch run build:renderer && hutch electrobun dev",
    dev: "hutch run build:renderer && hutch electrobun dev --watch",
    hmr: "hutch electrobun prepare && hutch pm exec -- vite --port 5173",
    build: "hutch run build:renderer && hutch electrobun build --env=stable",
    "package:windows": "hutch run package:windows:check && hutch run build",
    "package:windows:check": ["hutch", "pm", "exec", "--", "bun", "tools/package-windows.ts"],
    "package:appimage": ["hutch", "pm", "exec", "--", "bun", "tools/package-appimage.ts"],
    test: ["hutch", "pm", "exec", "--", "vitest", "run"],
    "test:smoke": ["hutch", "pm", "exec", "--", "vitest", "run", "src/smoke"],
    typecheck: "hutch electrobun prepare && hutch pm exec -- tsc --noEmit",
    lint: ["hutch", "pm", "exec", "--", "biome", "lint", "."],
    format: ["hutch", "pm", "exec", "--", "biome", "format", "--write", "."],
    "format:check": ["hutch", "pm", "exec", "--", "biome", "format", "."],
  },
  electrobun: {
    version: "2.0.1",
  },
};
