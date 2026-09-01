import type { ColorTheme } from "./contracts";

export interface BuiltInTheme {
  id: ColorTheme;
  name: string;
  description: string;
  preview: {
    light: string;
    dark: string;
    accent: string;
    font: string;
  };
}

export const BUILT_IN_THEMES: readonly BuiltInTheme[] = [
  {
    id: "default",
    name: "Default",
    description: "Graphite's neutral monochrome palette",
    preview: {
      light: "#f7f7f7",
      dark: "#141414",
      accent: "#71717a",
      font: '"Inter Variable", Inter, sans-serif',
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Crisp surfaces with familiar blue accents",
    preview: {
      light: "#ffffff",
      dark: "#0d1117",
      accent: "#0969da",
      font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },
  {
    id: "things",
    name: "Things",
    description: "Airy paper tones and focused blue details",
    preview: {
      light: "#fbfbfa",
      dark: "#17191d",
      accent: "#2f80ed",
      font: '"Inter Variable", Inter, sans-serif',
    },
  },
  {
    id: "shimmering-focus",
    name: "Shimmering Focus",
    description: "Warm reading surfaces with restrained violet",
    preview: {
      light: "#faf7f2",
      dark: "#1a181c",
      accent: "#8b6bb1",
      font: '"iA Writer Quattro", "Inter Variable", sans-serif',
    },
  },
  {
    id: "cupertino",
    name: "Cupertino",
    description: "Soft system grays and clear blue controls",
    preview: {
      light: "#f2f2f7",
      dark: "#1c1c1e",
      accent: "#007aff",
      font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    },
  },
  {
    id: "prism",
    name: "Prism",
    description: "Clean contrast with colorful code accents",
    preview: {
      light: "#f8f7ff",
      dark: "#171522",
      accent: "#7457d9",
      font: '"Source Sans 3 Variable", "Segoe UI", sans-serif',
    },
  },
  {
    id: "solarized",
    name: "Solarized",
    description: "Low-contrast warmth built for long sessions",
    preview: {
      light: "#fdf6e3",
      dark: "#002b36",
      accent: "#268bd2",
      font: '"iA Writer Quattro", "Inter Variable", sans-serif',
    },
  },
  {
    id: "nebula",
    name: "Nebula",
    description: "Cool cosmic surfaces with cyan highlights",
    preview: {
      light: "#f4f6fc",
      dark: "#111526",
      accent: "#55c2d9",
      font: '"Source Sans 3 Variable", "Segoe UI", sans-serif',
    },
  },
  {
    id: "void",
    name: "Void",
    description: "Maximum monochrome contrast and minimal color",
    preview: {
      light: "#ffffff",
      dark: "#050505",
      accent: "#8a8a8a",
      font: 'Arial, Helvetica, "Inter Variable", sans-serif',
    },
  },
];
