// Render docs/component-map.html to docs/component-map.png at 2× scale (PRD §15).
import { chromium } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.resolve("docs/component-map.html")).href);
await page.locator(".sheet").screenshot({ path: "docs/component-map.png" });
await browser.close();
console.log("wrote docs/component-map.png");
