import { expect, test, type Page } from "@playwright/test";

/**
 * SOPHIA BOT widget in a real browser, desktop and mobile. Opt-in: needs a server started with the bot enabled, e.g.
 *   SOPHIA_BOT_ENABLED=true GEMINI_API_KEY=<any placeholder> GEMINI_MODEL=<any id> next start -p 3100
 *   $env:E2E_BASE_URL="http://localhost:3100"; $env:E2E_BOT="1"; npx playwright test tests/e2e/sophia-bot.spec.ts
 * /api/bot/chat is answered in the browser by a stub (page.route), so no Gemini call is ever made and no key is needed.
 */
test.skip(process.env.E2E_BOT !== "1", "set E2E_BOT=1 with a bot-enabled server");

const SHOTS = "test-results/sophia-bot";

async function stubChat(page: Page) {
  await page.route("**/api/bot/chat", (route) =>
    route.fulfill({
      json: {
        answer: "Example answer from a published Sophia Forum record.",
        sources: [
          { title: "Example published record", url: "/about", tier: "primary", kind: "cms", verifiedOn: null },
          { title: "Example PCE page", url: "https://example.org/pce", tier: "secondary", kind: "document", verifiedOn: "2026-11-01" },
        ],
        fallback: null,
        language: "en",
      },
    }),
  );
}

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("launcher bottom-right in Retron2000; panel floats bottom-right with cited answer", async ({ page }) => {
    await stubChat(page);
    await page.goto("/");
    const launcher = page.getByTestId("sophia-bot-launcher");
    await expect(launcher).toBeVisible({ timeout: 15_000 });
    const l = await box(page, "sophia-bot-launcher");
    expect(l.x + l.width).toBeGreaterThan(1280 - 40);
    expect(l.y + l.height).toBeGreaterThan(800 - 40);
    const font = await launcher.getByText("ASK SOPHIA").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/Retron2000/);
    await page.screenshot({ path: `${SHOTS}-desktop-closed.png` });

    await launcher.click();
    const panel = page.getByTestId("sophia-bot-panel");
    await expect(panel).toBeVisible();
    const p = await box(page, "sophia-bot-panel");
    expect(Math.round(p.width)).toBe(400);
    expect(p.height).toBeLessThanOrEqual(640);
    expect(Math.round(1280 - (p.x + p.width))).toBe(16);
    expect(Math.round(800 - (p.y + p.height))).toBe(16);
    expect(await panel.getByRole("heading", { name: "SOPHIA BOT" }).evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Retron2000/);

    await page.getByLabel("Your question").fill("What is Sophia Forum?");
    await page.getByLabel("Your question").press("Enter");
    await expect(panel.getByText("Example answer from a published Sophia Forum record.")).toBeVisible();
    await expect(panel.getByRole("link", { name: /Example published record/ })).toHaveAttribute("href", "/about");
    await expect(panel.getByRole("link", { name: /Example PCE page/ })).toHaveAttribute("target", "_blank");
    await page.screenshot({ path: `${SHOTS}-desktop-open.png` });

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test("at the bottom of the page the launcher stays clear of the POWER SAVER button", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByTestId("sophia-bot-launcher")).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const power = page.getByRole("button", { name: /POWER SAVER/ });
    await expect(async () => {
      const a = await box(page, "sophia-bot-launcher");
      const b = (await power.boundingBox())!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap).toBe(false);
    }).toPass({ timeout: 5_000 });
    await page.screenshot({ path: `${SHOTS}-desktop-footer.png` });
  });

  test("not offered on /login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("sophia-bot-launcher")).toHaveCount(0);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("compact launcher; the panel is a full-height sheet; no horizontal overflow", async ({ page }) => {
    await stubChat(page);
    await page.goto("/");
    const launcher = page.getByTestId("sophia-bot-launcher");
    await expect(launcher).toBeVisible({ timeout: 15_000 });
    await expect(launcher.getByText("ASK SOPHIA")).toBeHidden();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}-mobile-closed.png` });

    await launcher.tap();
    const panel = page.getByTestId("sophia-bot-panel");
    await expect(panel).toBeVisible();
    const p = await box(page, "sophia-bot-panel");
    expect([Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)]).toEqual([0, 0, 390, 844]);
    await panel.getByRole("button", { name: "Sophia Forum ka mission kya hai?" }).tap();
    await expect(panel.getByText("Example answer from a published Sophia Forum record.")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}-mobile-open.png` });

    await panel.getByRole("button", { name: "Close Sophia Bot" }).tap();
    await expect(panel).toBeHidden();
  });
});
