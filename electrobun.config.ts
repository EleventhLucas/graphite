import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Graphite",
    identifier: "com.eleventhlucas.graphite",
    version: "0.1.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: {
      entrypoint: "src/main/index.ts",
    },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    watchIgnore: ["dist/**", "artifacts/**", "build/**"],
    mac: { bundleCEF: false },
    linux: {
      bundleCEF: false,
      icon: "src/renderer/public/graphite_app.png",
    },
    win: {
      bundleCEF: false,
      icon: "assets/graphite.ico",
    },
  },
} satisfies ElectrobunConfig;
