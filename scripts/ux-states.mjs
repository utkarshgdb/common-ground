// Screenshots of rarely-seen states at 390 px for a UX review: node scripts/ux-states.mjs http://localhost:3600
import { chromium } from "@playwright/test";

const B = process.argv[2] ?? "http://localhost:3600";
const OUT = "tests/e2e/screenshots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const shot = (name, full = true) => page.screenshot({ path: `${OUT}/ux-${name}.png`, fullPage: full });
const step = async (label) => {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: label }).first().waitFor({ state: "visible" });
  await page.waitForTimeout(400);
};

// 1. Real room: join screen + empty (no focus) state
const riya = await browser.newContext({ viewport: { width: 390, height: 844 } });
const rp = await riya.newPage();
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const add = (d, k) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const res = await rp.request.post(`${B}/api/rooms`, { data: { name: "Goa, finally?", coordinator: "Riya", members: ["Riya", "Siddharth", "Karan", "Aisha", "Preethi"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 60) } });
const { id } = await res.json();
await page.goto(`${B}/room/${id}`);
await page.getByRole("heading", { name: "Who are you?" }).waitFor();
await shot("join");
await rp.goto(`${B}/room/${id}`);
await rp.getByRole("heading", { name: /Start with your limits|Waiting/ }).waitFor();
await rp.screenshot({ path: `${OUT}/ux-empty-room-coordinator.png`, fullPage: true });

// 2. Demo: blocked agree sheet for Karan (no preferences yet)
await page.goto(`${B}/`);
await page.getByRole("button", { name: "Try the demo" }).click();
await page.waitForURL(/\/room\//);
await page.getByRole("heading", { name: "The November escape" }).waitFor();
await page.getByRole("button", { name: "Yes, I'm in" }).first().click();
await page.getByRole("dialog").waitFor();
await shot("agree-blocked", false);
await page.keyboard.press("Escape");

// 3. Needs a change sheet and Correct my estimate sheet
await step(/1\. Fill Karan/);
await page.getByRole("button", { name: "Needs a change" }).click();
await page.getByRole("dialog").waitFor();
await shot("needs-change", false);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Correct my estimate" }).click();
await page.getByRole("dialog").waitFor();
await shot("correct-estimate", false);
await page.keyboard.press("Escape");

// 4. Reopened: Karan says yes, then edits preferences
await step(/2\. Simulate four/);
await page.getByRole("button", { name: "Yes, I'm in" }).first().click();
await page.getByLabel(/I understand how this room decides/).check();
await page.getByLabel(/I've checked my journey/).check();
await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm in" }).click();
await page.getByText("Agreed for planning", { exact: true }).waitFor();
await shot("agreed");
await page.getByRole("tab", { name: /preferences/i }).click();
if (await page.getByRole("button", { name: /More details/ }).count()) await page.getByRole("button", { name: /More details/ }).click();
await page.getByLabel("Max travel time, one way (hours)").fill("11");
await page.getByRole("button", { name: /Save my preferences/ }).click();
await page.getByRole("tab", { name: /Your trip/ }).click();
await page.waitForTimeout(500);
await shot("reopened");

// 5. Coordinator: after deadline, then closed room
await page.getByLabel("View as").selectOption("Riya");
await page.waitForTimeout(600);
await step(/3\. Reach deadline/);
await shot("coordinator-after-deadline");
await page.getByRole("tab", { name: "History" }).click();
await shot("history");
await page.getByRole("tab", { name: /Your trip/ }).click();
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.waitForTimeout(700);
await shot("closed");

// 6. Coordinator with a fix-hint variant: focus an idea where someone isn't free
await page.getByRole("button", { name: "Reopen the room" }).click();
await page.waitForTimeout(500);
await page.getByRole("tab", { name: /compare/i }).click();
await shot("compare-coordinator");
await browser.close();
console.log("ok");
