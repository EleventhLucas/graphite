import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const staging = resolve(root, "build", "appimage", "Graphite.AppDir");
const output = resolve(root, "artifacts", "Graphite-0.1.0-x86_64.AppImage");

function requiredTool(environmentName: string, commandName: string): string {
  const override = process.env[environmentName];
  const located = override || Bun.which(commandName);
  if (!located) {
    throw new Error(
      `${commandName} is required. Set ${environmentName} to its absolute path or add ${commandName} to PATH.`,
    );
  }
  return located;
}

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${basename(command[0])} exited with code ${exitCode}.`);
}

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("Graphite AppImages must be built on a native Linux x64 runner.");
}

const linuxdeploy = requiredTool("LINUXDEPLOY_BIN", "linuxdeploy");
const appimagetool = requiredTool("APPIMAGETOOL_BIN", "appimagetool");

await run(["bun", "run", "build"]);

const bundleRoot = resolve(root, "build", "stable-linux-x64", "Graphite");
if (!(await stat(bundleRoot).catch(() => null))?.isDirectory()) {
  throw new Error(`Electrobun did not produce the expected Linux bundle at ${bundleRoot}.`);
}

const resolvedStaging = resolve(staging);
const buildRoot = resolve(root, "build");
if (!resolvedStaging.startsWith(`${buildRoot}/`) && !resolvedStaging.startsWith(`${buildRoot}\\`)) {
  throw new Error(
    "Refusing to clear an AppImage staging path outside the repository build directory.",
  );
}
await rm(resolvedStaging, { recursive: true, force: true });
await mkdir(resolve(staging, "usr", "lib", "graphite"), { recursive: true });
await mkdir(resolve(staging, "usr", "share", "applications"), { recursive: true });
await mkdir(resolve(staging, "usr", "share", "icons", "hicolor", "512x512", "apps"), {
  recursive: true,
});
await cp(bundleRoot, resolve(staging, "usr", "lib", "graphite"), { recursive: true });

const bundleFiles = await readdir(bundleRoot);
const launcher = ["Graphite", "graphite", "launcher"].find((candidate) =>
  bundleFiles.includes(candidate),
);
if (!launcher)
  throw new Error("Could not locate the Electrobun Linux launcher in the built bundle.");

const appRun = `#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/lib/graphite/${launcher}" "$@"\n`;
await writeFile(resolve(staging, "AppRun"), appRun, "utf8");
await chmod(resolve(staging, "AppRun"), 0o755);

const desktop = `[Desktop Entry]\nType=Application\nName=Graphite\nComment=Lightweight offline Markdown editor\nExec=Graphite\nIcon=graphite\nCategories=Office;TextEditor;\nTerminal=false\n`;
await writeFile(resolve(staging, "graphite.desktop"), desktop, "utf8");
await copyFile(
  resolve(staging, "graphite.desktop"),
  resolve(staging, "usr", "share", "applications", "graphite.desktop"),
);
await copyFile(resolve(root, "graphite_app.png"), resolve(staging, "graphite.png"));
await copyFile(
  resolve(root, "graphite_app.png"),
  resolve(staging, "usr", "share", "icons", "hicolor", "512x512", "apps", "graphite.png"),
);

await run([
  linuxdeploy,
  "--appdir",
  staging,
  "--executable",
  resolve(staging, "usr", "lib", "graphite", launcher),
  "--desktop-file",
  resolve(staging, "graphite.desktop"),
  "--icon-file",
  resolve(staging, "graphite.png"),
]);

await mkdir(resolve(root, "artifacts"), { recursive: true });
await run([appimagetool, staging, output]);
await chmod(output, 0o755);

const smokeVault = await mkdtemp(join(tmpdir(), "graphite-appimage-smoke-"));
try {
  await writeFile(resolve(smokeVault, "Welcome.md"), "# Graphite smoke test\n", "utf8");
  const xvfb = Bun.which("xvfb-run");
  const command = xvfb ? [xvfb, "-a", output] : [output];
  const child = Bun.spawn(command, {
    cwd: smokeVault,
    env: { ...process.env, GRAPHITE_SMOKE_VAULT: smokeVault },
    stdout: "inherit",
    stderr: "inherit",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 20_000);
  const exitCode = await child.exited;
  clearTimeout(timeout);
  if (timedOut || exitCode !== 0) {
    throw new Error(
      timedOut
        ? "The packaged AppImage smoke test timed out."
        : `The packaged AppImage smoke test exited with code ${exitCode}.`,
    );
  }
} finally {
  await rm(smokeVault, { recursive: true, force: true });
}
