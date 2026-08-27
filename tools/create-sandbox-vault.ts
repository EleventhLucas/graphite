import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSandboxVaultFiles, SANDBOX_VAULT_NAME } from "../src/shared/sandbox-vault";

const projectRoot = process.cwd();
const vaultRoot = path.resolve(projectRoot, "sandbox-vault");
const reset = process.argv.includes("--reset");

function vaultPath(relativePath: string) {
  const resolved = path.resolve(vaultRoot, relativePath);
  if (resolved !== vaultRoot && !resolved.startsWith(`${vaultRoot}${path.sep}`)) {
    throw new Error(`Sandbox fixture path escapes its vault: ${relativePath}`);
  }
  return resolved;
}

async function prepareTarget() {
  if (path.dirname(vaultRoot) !== projectRoot || path.basename(vaultRoot) !== "sandbox-vault") {
    throw new Error("Refusing to modify an unexpected sandbox target.");
  }

  let existing: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    existing = await lstat(vaultRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (existing?.isSymbolicLink()) throw new Error("Refusing to replace a symbolic-link sandbox.");
  if (existing && !reset) {
    throw new Error(
      "The committed sandbox already exists. Use `bun run sandbox:reset` explicitly.",
    );
  }
  if (existing) await rm(vaultRoot, { recursive: true });
  await mkdir(vaultRoot);
}

await prepareTarget();
for (const file of createSandboxVaultFiles()) {
  const destination = vaultPath(file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, file.bytes);
}

console.log(`${reset ? "Reset" : "Created"} committed ${SANDBOX_VAULT_NAME} at sandbox-vault`);
