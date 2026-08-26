if (process.platform !== "win32") {
  throw new Error("Windows packaging must run on a Windows x64 host.");
}

const missing: string[] = [];
if (!Bun.which("cmake")) missing.push("CMake on PATH");
if (!Bun.which("cl") && !process.env.VSINSTALLDIR) {
  missing.push("Visual Studio 2022 Build Tools with Desktop development with C++");
}

if (missing.length > 0) {
  throw new Error(
    `Graphite cannot package for Windows yet. Install: ${missing.join("; ")}. Then run this command from a Developer PowerShell.`,
  );
}

if (process.arch !== "x64") {
  throw new Error("Graphite v1 Windows packages target x64 hosts.");
}
