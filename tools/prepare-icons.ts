import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pngToIco from "png-to-ico";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "src", "renderer", "public", "graphite_app.png");
const assets = resolve(root, "assets");

await mkdir(assets, { recursive: true });
await copyFile(source, resolve(assets, "graphite.png"));
await writeFile(resolve(assets, "graphite.ico"), await pngToIco(source));
