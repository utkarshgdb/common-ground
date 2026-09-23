// Acceptance tests 6–8 (PRD §18): demo stories end to end, no Gemini key, and 390 px layouts without overflow.
import { expect, test, type Page } from "@playwright/test";

const SHOTS = "tests/e2e/screenshots";

async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL(/\/room\/\w+\?as=Karan/);
  await expect(page.getByRole("heading", { name: "The November escape" })).toBeVisible();
}
const step = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("button", { name }).first()).toBeEnabled();
};
const viewAs = (page: Page, name: string) => page.getByLabel("View as").selectOption(name);

async function noOverflow(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${label}: horizontal overflow`).toBeLessThanOrEqual(iw);
}

test("story 1: Reset → Simulate four → Reach deadline ⇒ unresolved 4/5, next move nudges Karan", async ({ page }) => {
  await startDemo(page);
  await step(page, "Reset");
  await step(page, /2\. Simulate four friends/);
  await expect(page.getByRole("heading", { name: /up for review\. 4\/5 have agreed/ })).toBeVisible();
  await step(page, /3\. Reach deadline/);
  await expect(page.getByText(/At the deadline .*: unresolved, 4\/5 yeses\./)).toBeVisible();
  await expect(page.getByText("Later answers don't rewrite this record.").first()).toBeVisible();
  await viewAs(page, "Riya");
  const card = page.getByRole("region", { name: "Next step" });
  await expect(card).toContainText("Waiting on Karan");
  await expect(card).toContainText("Suggested by the rules");
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/At the deadline: unresolved, 4\/5 yeses/)).toBeVisible();
  await expect(page.getByText(/\(demo: simulated\)/).first()).toBeVisible();
});

test("story 2: Reset → Fill Karan → Simulate four → Karan says yes ⇒ Agreed for planning", async ({ page }) => {
  await startDemo(page);
  await step(page, "Reset");
  await step(page, /1\. Fill Karan/);
  await step(page, /2\. Simulate four friends/);
  await page.getByRole("button", { name: "Yes, I'm in" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Can this trip work for you?" });
  const yes = sheet.getByRole("button", { name: "Yes, I'm in" });
  await expect(yes).toBeDisabled();
  await sheet.getByLabel(/I understand how this room decides/).check();
  await expect(yes).toBeDisabled(); // still needs the confirmation tick
  await sheet.getByLabel(/I've checked my journey and this estimate/).check();
  await yes.click();
  await expect(page.getByText("Agreed for planning", { exact: true })).toBeVisible();
  await expect(page.getByText("Book it yourself")).toBeVisible();
});

test("story 3: Try 3/5 ⇒ provisional comparison with Needs checking rows, never Fits", async ({ page }) => {
  await startDemo(page);
  await step(page, "Try 3/5");
  await page.getByRole("tab", { name: "Compare ideas" }).click();
  await expect(page.getByText(/Provisional until everyone has added preferences/)).toBeVisible();
  const ideas = page.locator("main ul.grid > li");
  expect(await ideas.count()).toBeGreaterThanOrEqual(3);
  for (const name of ["Karan", "Preethi"]) {
    const rows = page.locator("main ul.grid > li li", { hasText: name });
    const n = await rows.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toContainText("Needs checking");
      await expect(rows.nth(i)).not.toContainText("Fits stated inputs");
    }
  }
});

test("View-as is refused for a non-demo room (server-enforced)", async ({ request }) => {
  const r = await request.post("/api/rooms", {
    data: { name: "Real", coordinator: "Riya", members: ["Riya", "Aisha"], trip_days: 3, window_start: "2026-10-05", window_end: "2026-11-20" },
  });
  const { id } = await r.json();
  const anon = await request.get(`/api/rooms/${id}?as=Aisha`, { headers: { cookie: "" } });
  const v = await anon.json();
  expect(v.viewer.name).not.toBe("Aisha");
  const demoStep = await request.post(`/api/rooms/${id}/demo`, { data: { step: "simulate" } });
  expect(demoStep.status()).toBe(403);
});

for (const vp of [{ w: 390, h: 844, tag: "390" }, { w: 1280, h: 900, tag: "1280" }]) {
  test(`screens at ${vp.tag}px: no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto("/");
    await noOverflow(page, "landing");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-landing.png`, fullPage: true });
    await startDemo(page);
    await step(page, "Reset");
    await step(page, /1\. Fill Karan/);
    await noOverflow(page, "your trip");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-your-trip.png`, fullPage: true });
    await page.getByRole("button", { name: "Yes, I'm in" }).first().click();
    await page.getByRole("dialog").waitFor();
    await noOverflow(page, "agree");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-agree.png`, fullPage: false });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Compare ideas" }).click();
    await noOverflow(page, "compare");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-compare.png`, fullPage: true });
    await page.getByRole("tab", { name: "Your preferences" }).click();
    await noOverflow(page, "preferences");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-preferences.png`, fullPage: true });
    await viewAs(page, "Riya");
    await page.getByRole("tab", { name: "Your trip" }).click();
    await expect(page.getByRole("region", { name: "Next step" })).toBeVisible();
    await noOverflow(page, "coordinator");
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-coordinator.png`, fullPage: true });
    await page.getByRole("tab", { name: "History" }).click();
    await page.screenshot({ path: `${SHOTS}/${vp.tag}-history.png`, fullPage: true });
  });
}
