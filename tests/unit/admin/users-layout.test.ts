// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import AdminUsersLayout from "@/app/admin/users/layout";

// /admin/users with the real Supabase sign-in: Next's notFound() (the site's 404 page), so the demo accounts are never
// served; with the demo sign-in the page renders unchanged.
describe("/admin/users route guard", () => {
  it("Supabase sign-in: calls notFound()", () => {
    vi.stubEnv("CMS_AUTH_MODE", "supabase");
    let thrown: unknown;
    try { AdminUsersLayout({ children: "page" }); } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(String((thrown as { digest?: string }).digest)).toMatch(/404/);
  });

  it.each([["demo"], [""], ["something-else"]])("demo sign-in (CMS_AUTH_MODE=%j): renders the Users page as before", (mode) => {
    vi.stubEnv("CMS_AUTH_MODE", mode);
    expect(AdminUsersLayout({ children: "page" })).toBe("page");
  });
});
