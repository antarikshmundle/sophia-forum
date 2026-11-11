import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The mock-account Users screen is offered only with the demo sign-in; with the real Supabase sign-in it is hidden.
const state = vi.hoisted(() => ({
  authMode: "demo" as "demo" | "supabase",
  facultyMode: "demo" as "demo" | "backend" | "unavailable",
  session: { email: "admin@example.invalid", name: "Admin", role: "admin" } as { email: string; name: string; role: string } | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/auth/AuthModeProvider", () => ({ useAuthMode: () => state.authMode }));
vi.mock("@/components/admin/FacultyModeProvider", () => ({ useFacultyMode: () => state.facultyMode }));
vi.mock("@/hooks/useAdminSession", () => ({
  useAdminSession: () => state.session,
  useAdminSessionState: () => ({ session: state.session, ready: true }),
  signOutAdmin: vi.fn(),
}));

import { AdminShell, ADMIN_TABS } from "@/components/admin/AdminShell";
import AdminDashboardPage from "@/app/admin/page";

beforeEach(() => {
  state.session = { email: "admin@example.invalid", name: "Admin", role: "admin" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
});

describe("Users tab", () => {
  it("is marked demo-only and admin-only", () => {
    expect(ADMIN_TABS.find((t) => t.href === "/admin/users")).toMatchObject({ adminOnly: true, demoOnly: true });
  });

  it("demo sign-in: the admin sees the Users tab", () => {
    state.authMode = "demo"; state.facultyMode = "demo";
    render(<AdminShell><p>content</p></AdminShell>);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
  });

  it("demo sign-in: a manager still does not see it (admin-only, unchanged)", () => {
    state.authMode = "demo"; state.facultyMode = "demo"; state.session = { email: "m@example.invalid", name: "M", role: "manager" };
    render(<AdminShell><p>content</p></AdminShell>);
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it.each([["backend"], ["demo"], ["unavailable"]] as const)("Supabase sign-in (faculty mode %s): no Users tab; the other tabs are unchanged", (fm) => {
    state.authMode = "supabase"; state.facultyMode = fm;
    render(<AdminShell><p>content</p></AdminShell>);
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    for (const name of ["Overview", "Events", "Gallery", "Team", "Faculty"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
    if (fm === "backend") expect(screen.getByRole("link", { name: "Content" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Users is still a local demo/);
  });
});

describe("Overview Users card", () => {
  it("demo sign-in: shows the mock-accounts card with the demo store count", () => {
    state.authMode = "demo"; state.facultyMode = "demo";
    render(<AdminDashboardPage />);
    const card = screen.getByRole("link", { name: /users/i });
    expect(card).toHaveAttribute("href", "/admin/users");
    expect(card.textContent).toMatch(/mock accounts/);
  });

  it("Supabase sign-in: no Users card and no link to /admin/users; the other cards remain", async () => {
    state.authMode = "supabase"; state.facultyMode = "backend";
    const { container } = render(<AdminDashboardPage />);
    expect(container.querySelector('a[href="/admin/users"]')).toBeNull();
    expect(container.textContent).not.toMatch(/mock accounts/);
    for (const href of ["/admin/events", "/admin/gallery", "/admin/team", "/admin/faculty"]) expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
  });
});
