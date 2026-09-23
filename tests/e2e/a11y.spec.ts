// Accessibility audit (axe-core, the engine behind Lighthouse's accessibility score) on the landing and room pages.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing and room pages have no serious accessibility violations", async ({ page }) => {
  const audit = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of r.violations) console.log(`[${label}] ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`);
    expect(bad, `${label}: ${bad.map((b) => b.id).join(", ")}`).toEqual([]);
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await audit("landing");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL(/\/room\//);
  await page.getByRole("button", { name: /1\. Fill Karan/ }).click();
  await expect(page.getByRole("button", { name: /1\. Fill Karan/ })).toBeEnabled();
  await audit("your trip");
  await page.getByRole("tab", { name: "Compare ideas" }).click();
  await audit("compare");
  await page.getByRole("tab", { name: "Your preferences" }).click();
  await audit("preferences");
  await page.getByLabel("View as").selectOption("Riya");
  await page.getByRole("tab", { name: "Your trip" }).click();
  await expect(page.getByRole("region", { name: "Next step" })).toBeVisible();
  await audit("coordinator");
});
