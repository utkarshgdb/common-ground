// Lighthouse accessibility score for the room page, using Playwright's Chromium (usage: node scripts/lighthouse.mjs <baseUrl>)
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const base = process.argv[2] ?? "http://localhost:3300";
const res = await fetch(`${base}/api/demo`, { method: "POST" });
const { id } = await res.json();
const browser = await chromium.launch({ args: ["--remote-debugging-port=9333"] });
const results = {};
for (const [label, path] of [["landing", "/"], ["room (Karan)", `/room/${id}?as=Karan`], ["room (Riya, coordinator)", `/room/${id}?as=Riya`]]) {
  const r = await lighthouse(`${base}${path}`, { port: 9333, onlyCategories: ["accessibility"], formFactor: "mobile", logLevel: "error" });
  const lhr = r.lhr;
  results[label] = Math.round(lhr.categories.accessibility.score * 100);
  const fails = Object.values(lhr.audits).filter((a) => a.scoreDisplayMode === "binary" && a.score === 0).map((a) => a.id);
  console.log(`${label}: accessibility ${results[label]}${fails.length ? "  failing: " + fails.join(", ") : ""}`);
}
await browser.close();
