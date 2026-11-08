import { expect, test } from "@playwright/test";

test("submits a rate request, holds it, then approves, rejects, and edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Quote the lane. Hold the send." })).toBeVisible();

  await page.getByTestId("sample-0").click();
  await page.getByTestId("submit-request").click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("Chicago, IL → Dallas, TX", { timeout: 20_000 });
  await expect(timeline).toContainText("Northwind");
  await expect(timeline.getByTestId("run-state")).toHaveText("Held");
  const chicago = page.getByTestId("approval-card").filter({ hasText: "Chicago" }).last();
  await expect(chicago).toContainText("$2,934.80");
  await chicago.getByTestId("approve").click();
  await expect(timeline.getByTestId("run-state")).toHaveText("Sent", { timeout: 20_000 });
  await expect(timeline).toContainText("simulated send");

  await page.getByTestId("sample-1").click();
  await page.getByTestId("submit-request").click();
  await expect(timeline).toContainText("Atlanta, GA → Miami, FL");
  const atlanta = page.getByTestId("approval-card").filter({ hasText: "Atlanta" }).last();
  await atlanta.getByTestId("reject").click();
  await expect(timeline.getByTestId("run-state")).toHaveText("Rejected");
  await expect(timeline).toContainText("did not mark the quote sent");

  await page.getByTestId("sample-2").click();
  await page.getByTestId("submit-request").click();
  await expect(timeline).toContainText("Dallas, TX → Atlanta, GA");
  const dallas = page.getByTestId("approval-card").filter({ hasText: "Dallas" }).last();
  await dallas.getByTestId("edit-quote").click();
  await dallas.getByTestId("edit-amount").fill("2500");
  await dallas.getByTestId("save-edit").click();
  await expect(timeline.getByTestId("run-state")).toHaveText("Sent");
  await expect(timeline).toContainText("$2,500.00");
  await expect(timeline).toContainText("edited from");
});
