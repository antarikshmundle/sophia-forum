import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/", session: null as null | { role: string }, signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// a plain anchor: the test checks the menu's own onClick, not Next's router
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e); }}>{children}</a>
  ),
}));
vi.mock("@/components/auth/AccountButton", () => ({ AccountButton: () => <button type="button">Account</button> }));
vi.mock("@/components/auth/AuthModeProvider", () => ({ useAuthMode: () => "demo" }));
vi.mock("@/hooks/useAdminSession", () => ({ useAdminSession: () => nav.session, signOutAdmin: nav.signOut }));

import { Navbar } from "@/components/layout/Navbar";

const menu = () => screen.queryByRole("dialog", { name: "Navigation menu" });
const toggle = () => screen.getByRole("button", { name: "Open navigation menu" });

beforeEach(() => {
  nav.pathname = "/";
  nav.session = null;
  document.body.style.overflow = "";
});

async function openMenu() {
  const user = userEvent.setup();
  const view = render(<Navbar />);
  await user.click(toggle());
  return { user, view, dialog: menu()! };
}

describe("Navbar — mobile menu", () => {
  it("opens as a modal dialog, focuses inside and locks page scrolling", async () => {
    const { dialog } = await openMenu();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("scrolls inside itself on short screens", async () => {
    const { dialog } = await openMenu();
    expect(dialog.className).toMatch(/\boverflow-y-auto\b/);
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    const { user } = await openMenu();
    await user.keyboard("{Escape}");
    expect(menu()).toBeNull();
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with the close button", async () => {
    const { user, dialog } = await openMenu();
    await user.click(within(dialog).getByRole("button", { name: "Close navigation menu" }));
    expect(menu()).toBeNull();
  });

  it("keeps Tab focus inside the menu in both directions", async () => {
    const { user, dialog } = await openMenu();
    const focusable = within(dialog).getAllByRole("link").concat(within(dialog).getAllByRole("button"));
    const order = [...dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    expect(order).toHaveLength(focusable.length);
    order[order.length - 1].focus();
    await user.tab();
    expect(order[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(order[order.length - 1]).toHaveFocus();
  });

  it("closes when the current page's link or the logo is tapped (no route change)", async () => {
    const { user, dialog } = await openMenu();
    await user.click(within(dialog).getByRole("link", { name: /^home$/i }));
    expect(menu()).toBeNull();
    await user.click(toggle());
    await user.click(within(menu()!).getByRole("link", { name: "Sophia Forum Home" }));
    expect(menu()).toBeNull();
  });

  it("links every main section and closes when the route changes", async () => {
    const { view, dialog } = await openMenu();
    const hrefs = within(within(dialog).getByRole("navigation", { name: "Mobile" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/about", "/team", "/events", "/gallery"]);
    nav.pathname = "/events";
    await act(async () => view.rerender(<Navbar />));
    expect(menu()).toBeNull();
  });

  it("signed out: the sign-in button opens the login dialog and closes the menu", async () => {
    const { user, dialog } = await openMenu();
    const opened = vi.fn();
    window.addEventListener("open-login", opened);
    await user.click(within(dialog).getByRole("button", { name: /team sign-in/i }));
    window.removeEventListener("open-login", opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("signed in: offers the dashboard and sign-out", async () => {
    nav.session = { role: "admin" };
    const { user, dialog } = await openMenu();
    expect(within(dialog).getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/admin");
    await user.click(within(dialog).getByRole("button", { name: /sign out \(admin\)/i }));
    expect(nav.signOut).toHaveBeenCalledWith("demo");
    expect(menu()).toBeNull();
  });
});

describe("Navbar — current page", () => {
  it.each([["/", "HOME"], ["/events/algorave-3-0", "EVENTS"], ["/team", "TEAM"]])("marks %s as %s in both menus", async (pathname, name) => {
    nav.pathname = pathname;
    const { dialog } = await openMenu();
    const desktop = screen.getByRole("navigation", { name: "Main Navigation" });
    for (const scope of [desktop, dialog]) {
      const current = within(scope).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
      expect(current.map((a) => a.textContent?.trim().replace(/\d+$/, ""))).toEqual([name]);
    }
  });
});
