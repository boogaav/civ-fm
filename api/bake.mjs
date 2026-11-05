// Bakes data the API can't read straight from the site: taxes.js is a JS
// literal (comments, unquoted keys), so turn it into api/taxes.json.
//   node api/bake.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("../taxes.js", import.meta.url), "utf8");
const TAXES = new Function(src + ";return TAXES")();
fs.writeFileSync(new URL("taxes.json", import.meta.url), JSON.stringify(TAXES));
console.log("api/taxes.json", Object.keys(TAXES.income).length, "income,", Object.keys(TAXES.corporate).length, "corporate");
