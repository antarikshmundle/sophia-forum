import { expect, test, type Page } from "@playwright/test";

// Read-only: public pages only, never signs in, never writes. Pixel-level checks jsdom can't do.
const BACKEND = process.env.E2E_BACKEND === "1";
const PAGES = ["/", "/about", "/team", "/events", "/gallery"];

async function settle(page: Page) {
  // scroll through once so lazily rendered / animated sections are laid out
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    scrollTo(0, 0);
  });
}

/** Taps the menu button until the menu opens: a tap before hydration (slow dev server) does nothing. */
async function openMenu(page: Page) {
  const menu = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole("button", { name: "Open navigation menu" }).tap();
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  return menu;
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [320, 768, 1440]) {
  test.describe(`no horizontal overflow at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 640 : 900 } });
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}

// The CSP is report-only: violations are not blocked, but the browser reports them (securitypolicyviolation event
// and a console message). A clean report here is the condition for switching the policy to enforcing later.
async function watchCsp(page: Page) {
  const messages: string[] = [];
  page.on("console", (m) => { if (/content security policy/i.test(m.text())) messages.push(m.text()); });
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return async () => [...messages, ...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp))];
}

test.describe("security headers and report-only CSP", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every page sends the security headers", async ({ request }) => {
    for (const path of PAGES) {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"], path).toContain("max-age=");
      expect(h["permissions-policy"], path).toContain("camera=()");
      expect(h["content-security-policy-report-only"], path).toContain("default-src 'self'");
      expect(h["content-security-policy"], path).toBeUndefined();
    }
  });

  for (const path of PAGES) {
    test(`${path}: no CSP violations reported`, async ({ page }) => {
      const violations = await watchCsp(page);
      await page.goto(path);
      await settle(page);
      expect(await violations()).toEqual([]);
    });
  }

  test("a YouTube video player loads without CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto("/gallery");
    const play = page.getByRole("button", { name: /^Play video:/ }).first();
    test.skip((await play.count()) === 0, "no videos published");
    await play.click();
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]').first()).toBeAttached();
    await page.waitForTimeout(1500);
    expect(await violations()).toEqual([]);
  });
});

test.describe("mobile menu (touch)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("opens, closes on Escape, and returns focus", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    const menu = await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("tapping the current page closes the menu; other links navigate", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    const menu = await openMenu(page);
    await menu.getByRole("link", { name: /^home$/i }).tap();
    await expect(menu).toBeHidden();
    await toggle.tap();
    await menu.getByRole("link", { name: /^about/i }).tap();
    await expect(page).toHaveURL(/\/about$/);
    await expect(menu).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
});

test.describe("mobile menu on a short (landscape) screen", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("scrolls so every link is reachable", async ({ page }) => {
    await page.goto("/");
    const gallery = (await openMenu(page)).getByRole("link", { name: /^gallery/i });
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery).toBeInViewport();
    await gallery.tap();
    await expect(page).toHaveURL(/\/gallery$/);
  });
});

test.describe("CMS-backed layout (E2E_BACKEND=1)", () => {
  test.skip(!BACKEND, "needs a server in CMS backend mode");

  for (const [width, row] of [[320, false], [768, false], [1440, true]] as const) {
    test(`About authorities: ${row ? "one row" : "stacked"} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/about");
      const items = page.getByRole("region", { name: /institutional authorities/i }).getByRole("listitem");
      const count = await items.count();
      test.skip(count < 2, "fewer than two published authority profiles");
      const boxes = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
      for (const b of boxes) expect(b.right).toBeLessThanOrEqual(width);
      if (row) expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
      else for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    });
  }

  test("Gallery: an empty gallery says so without offering a filter reset", async ({ page }) => {
    await page.goto("/gallery");
    const status = await page.getByRole("status").filter({ hasText: /^Showing/ }).textContent();
    test.skip(status !== "Showing 0 of 0 photos and 0 of 0 videos", "the gallery has published media");
    await expect(page.getByText("Photos and videos will appear here once they are published.")).toBeVisible();
    await expect(page.getByRole("button", { name: /reset filters/i })).toHaveCount(0);
  });
});
