import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_PREFERENCES, type AppPreferences, type VaultSummary } from "../shared/contracts";

interface PersistedState {
  preferences: AppPreferences;
  recentVaults: VaultSummary[];
}

function statePath(): string {
  const home = homedir();
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Graphite", "state.json");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Graphite", "state.json");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "graphite", "state.json");
}

export class PreferencesStore {
  private state: PersistedState = {
    preferences: structuredClone(DEFAULT_PREFERENCES),
    recentVaults: [],
  };

  async load(): Promise<void> {
    try {
      const stored = JSON.parse(await readFile(statePath(), "utf8")) as Partial<PersistedState>;
      this.state = {
        preferences: {
          ...DEFAULT_PREFERENCES,
          ...stored.preferences,
          lastNoteByVault: stored.preferences?.lastNoteByVault ?? {},
        },
        recentVaults: Array.isArray(stored.recentVaults) ? stored.recentVaults.slice(0, 10) : [],
      };
    } catch {
      this.state = {
        preferences: structuredClone(DEFAULT_PREFERENCES),
        recentVaults: [],
      };
    }
  }

  snapshot(): PersistedState {
    return structuredClone(this.state);
  }

  async updatePreferences(preferences: AppPreferences): Promise<AppPreferences> {
    this.state.preferences = {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      lastNoteByVault: preferences.lastNoteByVault ?? {},
      sidebarWidth: Math.min(480, Math.max(180, preferences.sidebarWidth)),
      editorRatio: Math.min(0.8, Math.max(0.2, preferences.editorRatio)),
    };
    await this.persist();
    return structuredClone(this.state.preferences);
  }

  async touchVault(vault: VaultSummary): Promise<void> {
    this.state.recentVaults = [
      vault,
      ...this.state.recentVaults.filter((item) => item.id !== vault.id),
    ].slice(0, 10);
    this.state.preferences.lastVaultId = vault.id;
    await this.persist();
  }

  async removeRecent(vaultId: string): Promise<void> {
    this.state.recentVaults = this.state.recentVaults.filter((vault) => vault.id !== vaultId);
    if (this.state.preferences.lastVaultId === vaultId) delete this.state.preferences.lastVaultId;
    await this.persist();
  }

  private async persist(): Promise<void> {
    const target = statePath();
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }
}
