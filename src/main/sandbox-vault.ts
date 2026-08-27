import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createSandboxVaultFiles, SANDBOX_VAULT_NAME } from "../shared/sandbox-vault";

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error("A sandbox directory was replaced by an unsupported entry.");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(path);
  }
}

export async function ensureSandboxVault(dataRoot: string, reset = false): Promise<string> {
  const absoluteDataRoot = resolve(dataRoot);
  const target = join(absoluteDataRoot, SANDBOX_VAULT_NAME);
  if (dirname(target) !== absoluteDataRoot) throw new Error("Unexpected sandbox location.");

  await mkdir(absoluteDataRoot, { recursive: true });
  if (reset) {
    try {
      const details = await lstat(target);
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw new Error("The sandbox working copy has an unsupported root.");
      }
      await rm(target, { recursive: true });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  await ensureDirectory(target);

  for (const file of createSandboxVaultFiles()) {
    const destination = resolve(target, file.path);
    if (!destination.startsWith(`${target}${sep}`)) {
      throw new Error("A sandbox fixture escaped its working copy.");
    }

    let current = target;
    for (const part of file.path.split("/").slice(0, -1)) {
      current = join(current, part);
      await ensureDirectory(current);
    }

    try {
      const details = await lstat(destination);
      if (details.isSymbolicLink() || !details.isFile()) {
        throw new Error("A sandbox file was replaced by an unsupported entry.");
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await writeFile(destination, file.bytes, { flag: "wx" });
    }
  }

  return target;
}
