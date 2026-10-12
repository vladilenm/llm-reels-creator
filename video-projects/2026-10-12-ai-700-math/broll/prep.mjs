// Inline brand Inter (Cyrillic) into clip fragments: src/NN.html → clips/NN.html.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const face = [400, 500, 700, 800].map((w) =>
  `@font-face{font-family:'Inter';font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(join(root, `brand/fonts/Inter-${w}.ttf`)).toString("base64")}) format('truetype')}`).join("\n");
const common = readFileSync(join(here, "src/_common.css"), "utf8").replace("/*INTER*/", face);
for (const f of readdirSync(join(here, "src")).filter((f) => /^\d\d-.*\.html$/.test(f))) {
  writeFileSync(join(here, "clips", f), readFileSync(join(here, "src", f), "utf8").replace("/*COMMON*/", common));
  console.log("clips/" + f);
}
