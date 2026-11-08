import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = process.env.SCREENSHOT_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  await mkdir("docs/screenshots", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(baseURL);
  await page.getByRole("heading", { name: "Quote the lane. Hold the send." }).waitFor();

  await page.getByTestId("sample-0").click();
  await page.getByTestId("submit-request").click();
  await page.getByRole("heading", { name: "Chicago, IL → Dallas, TX" }).waitFor();

  await page.getByTestId("sample-1").click();
  await page.getByTestId("submit-request").click();
  await page.getByRole("heading", { name: "Atlanta, GA → Miami, FL" }).waitFor();

  await page.getByTestId("run-list").getByRole("button", { name: /Chicago/ }).first().click();
  await page.getByRole("heading", { name: "Chicago, IL → Dallas, TX" }).waitFor();
  await page.getByText("Northwind Transport").first().waitFor();
  await page.screenshot({
    path: "docs/screenshots/runs-timeline.png",
    fullPage: true,
  });

  const atlanta = page.getByTestId("approval-card").filter({ hasText: "Atlanta" }).last();
  await atlanta.getByTestId("edit-quote").click();
  await atlanta.getByTestId("edit-amount").waitFor();
  await page.screenshot({
    path: "docs/screenshots/approval-queue.png",
    fullPage: true,
  });

  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
