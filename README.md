# Graphite

Graphite is a lightweight, offline-capable Markdown editor for Obsidian vault folders. The same React workspace runs as a desktop app or directly in a supported browser, with a file tree, source and preview panes, autosave, quick open, GFM, wikilinks, and local embeds—without plugins, sync, telemetry, or vault uploads.

## Setup

Install [Bun 1.3.14](https://bun.sh/) and run:

```text
bun install
bun run dev:web
```

The web editor runs in desktop Microsoft Edge or Google Chrome. Choose a local folder when prompted; Graphite receives a browser-managed handle and reads or writes the folder directly on your device. Folder handles are remembered in IndexedDB, but the browser may ask you to approve access again after a restart. Other browsers receive a clear unsupported-browser screen. The web platform does not expose the operating system trash, so that command is hidden; renaming and moving remain available.

Once loaded, the production web build is cached as an installable PWA. The editor and its preview dependencies work offline. Vault content is never copied into the cache or uploaded to the host.

To work on the Electrobun desktop build, run `bun run dev`. The first Electrobun command downloads its pinned, checksum-verified 2.0.1 toolchain. Windows builds also require CMake and Visual Studio 2022 Build Tools with **Desktop development with C++**. Linux builds require the Electrobun GTK/WebKitGTK development packages documented upstream.

## Commands

```text
bun run dev              Full desktop app
bun run dev:web          Web editor with direct local-folder access
bun run dev:renderer     Alias for the web editor
bun run build:web        Production PWA in src/renderer/dist
bun run typecheck        TypeScript validation
bun run lint             Biome lint
bun run format:check     Formatting check
bun run test             Unit, component, and integration tests
bun run test:smoke       Bounded renderer smoke test
bun run build            Host-native stable Electrobun build
bun run package:windows  Windows x64 unsigned setup
bun run package:appimage Linux x64 AppImage
```

Linux AppImage packaging must run on Ubuntu 24.04 LTS x64. Graphite pins
[`linuxdeploy` 1-alpha-20251107-1](https://github.com/linuxdeploy/linuxdeploy/releases/tag/1-alpha-20251107-1)
and [`appimagetool` 1.9.1](https://github.com/AppImage/appimagetool/releases/tag/1.9.1).
Install those commands yourself, or set `LINUXDEPLOY_BIN` and `APPIMAGETOOL_BIN` to their
absolute paths. The checked-in wrapper never downloads tools or embeds personal paths. It builds a
standard AppDir, bundles deployable libraries, writes
`artifacts/Graphite-0.1.0-x86_64.AppImage`, and launches that artifact against a temporary vault
outside the source tree. On a headless runner, install `xvfb-run` for the smoke launch.

VS Code launch configurations are included for the desktop app, web editor, and tests.
