import * as Dialog from "@radix-ui/react-dialog";
import { Check, Moon, Sun, X } from "lucide-react";
import { type CSSProperties, useId } from "react";
import type { AppPreferences, ColorTheme, ThemePreference } from "../../shared/contracts";
import { BUILT_IN_THEMES } from "../../shared/themes";
import { Button } from "./Button";

interface SettingsDialogProps {
  open: boolean;
  preferences: AppPreferences;
  onOpenChange(open: boolean): void;
  onChange(preferences: AppPreferences): void;
}

export function SettingsDialog({ open, preferences, onOpenChange, onChange }: SettingsDialogProps) {
  const appearanceTabId = useId();
  const appearancePanelId = useId();
  const setMode = (theme: ThemePreference) => onChange({ ...preferences, theme });
  const setColorTheme = (colorTheme: ColorTheme) => onChange({ ...preferences, colorTheme });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay settings-dialog-overlay" />
        <Dialog.Content className="settings-dialog-content">
          <header className="settings-dialog-header">
            <div>
              <Dialog.Title className="settings-dialog-title">Settings</Dialog.Title>
              <Dialog.Description className="settings-dialog-description">
                Personalize how Graphite looks on this device.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close settings" title="Close">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>

          <div className="settings-dialog-body">
            <div className="settings-tabs" role="tablist" aria-label="Settings categories">
              <button
                id={appearanceTabId}
                className="settings-tab settings-tab-active"
                type="button"
                role="tab"
                aria-selected="true"
                aria-controls={appearancePanelId}
              >
                Appearance
              </button>
            </div>

            <section
              id={appearancePanelId}
              className="settings-section settings-panel"
              role="tabpanel"
              aria-labelledby={appearanceTabId}
            >
              <fieldset className="settings-field">
                <legend className="settings-field-label">Mode</legend>
                <div className="appearance-mode-control">
                  <button
                    type="button"
                    aria-pressed={preferences.theme === "light"}
                    onClick={() => setMode("light")}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                  <button
                    type="button"
                    aria-pressed={preferences.theme === "dark"}
                    onClick={() => setMode("dark")}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                </div>
              </fieldset>

              <fieldset className="settings-field theme-selector">
                <legend className="settings-field-label">Theme</legend>
                <div className="theme-options" role="radiogroup" aria-label="Theme">
                  {BUILT_IN_THEMES.map((theme) => {
                    const selected = preferences.colorTheme === theme.id;
                    const swatchStyle = {
                      "--theme-light-preview": theme.preview.light,
                      "--theme-dark-preview": theme.preview.dark,
                      "--theme-accent-preview": theme.preview.accent,
                      "--theme-font-preview": theme.preview.font,
                    } as CSSProperties;
                    return (
                      <label key={theme.id} className="theme-option">
                        <input
                          className="sr-only"
                          type="radio"
                          name="graphite-theme"
                          value={theme.id}
                          checked={selected}
                          onChange={() => setColorTheme(theme.id)}
                        />
                        <span className="theme-swatch" style={swatchStyle} aria-hidden="true">
                          <span />
                        </span>
                        <span className="theme-option-copy">
                          <strong>{theme.name}</strong>
                          <small>{theme.description}</small>
                        </span>
                        <span className="theme-option-check" aria-hidden="true">
                          {selected && <Check size={14} />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
