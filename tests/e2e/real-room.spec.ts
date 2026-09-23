// A real room from two browser contexts: create, join, save limits, and confirm the raw API response is private
// (the same flow runs against production for acceptance test 9 with E2E_BASE_URL set).
import { expect, test } from "@playwright/test";

test("create a room, join from a second browser, and check the privacy projection", async ({ browser, baseURL }) => {
  const riya = await browser.newContext();
  const aisha = await browser.newContext();
  const rp = await riya.newPage();
  await rp.goto("/");
  await rp.getByLabel("Trip name").fill("Smoke test trip");
  await rp.getByLabel("Your name").fill("Riya");
  await rp.getByLabel("Friend 1").fill("Aisha");
  await rp.getByLabel("Friend 2").fill("Karan");
  await rp.getByRole("button", { name: "Create the room" }).click();
  await expect(rp.getByRole("heading", { name: "Your room is ready" })).toBeVisible();
  const group = await rp.getByLabel("Group link").inputValue();
  expect(group).toMatch(/\/room\/\w+$/);
  const coordLink = await rp.getByLabel("Your coordinator link").inputValue();
  expect(coordLink).toContain("#c=");
  await rp.getByRole("link", { name: "Open the room" }).click();

  // Riya's limits (with values that must never reach Aisha)
  await rp.getByRole("tab", { name: "Your preferences" }).click();
  await rp.getByLabel("Home city").selectOption("bengaluru");
  await rp.getByLabel("Max budget, all-in (₹)").fill("27613");
  await rp.getByRole("button", { name: "More details (optional)" }).click();
  await rp.getByLabel("Private note").fill("RIYA-PRIVATE-NOTE-XYZ");
  await rp.locator("input[type=checkbox]").first().check();
  await rp.getByRole("button", { name: /Save my preferences/ }).click();
  await expect(rp.getByRole("tab", { name: "Your trip", selected: true })).toBeVisible();

  // Aisha joins from a separate browser context
  const ap = await aisha.newPage();
  await ap.goto(group);
  await expect(ap.getByRole("heading", { name: "Who are you?" })).toBeVisible();
  await expect(ap.getByRole("button", { name: /Riya/ })).toBeDisabled(); // already claimed
  await ap.getByRole("button", { name: /^Aisha/ }).click();
  await expect(ap.getByRole("heading", { name: /You're in, Aisha/ })).toBeVisible();
  expect(await ap.getByLabel("Your private link").inputValue()).toMatch(/\/r\/\w+#k=/);
  await ap.getByRole("button", { name: "Continue to the trip" }).click();

  // Raw API response as Aisha
  const id = group.split("/").pop()!;
  const res = await ap.request.get(`${baseURL}/api/rooms/${id}`);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const raw = await res.text();
  const v = JSON.parse(raw);
  expect(v.viewer.name).toBe("Aisha");
  expect(v.coordinator).toBeNull();
  for (const secret of ["27613", "27,613", "RIYA-PRIVATE-NOTE-XYZ", "bengaluru", "Bengaluru"]) expect(raw).not.toContain(secret);

  // Aisha can't act as coordinator or answer for someone else
  const hijack = await ap.request.post(`${baseURL}/api/rooms/${id}/action`, { data: { type: "extend", payload: { deadline_at: new Date(Date.now() + 9e8).toISOString() } } });
  expect(hijack.status()).toBe(403);
  const asRiya = await ap.request.post(`${baseURL}/api/rooms/${id}/action`, { data: { type: "preferences", as: "Riya", payload: { budget_max: 5000 } } });
  expect(asRiya.ok()).toBeTruthy();
  const riyaView = await (await rp.request.get(`${baseURL}/api/rooms/${id}`)).json();
  expect(riyaView.me.prefs.budget_max).toBe(27613); // "as" was ignored: the write went to Aisha, not Riya

  // Coordinator sees the Next-step card
  await rp.reload();
  await expect(rp.getByRole("region", { name: "Next step" })).toBeVisible();
  await riya.close();
  await aisha.close();
});
