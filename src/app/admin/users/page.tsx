"use client";

import React from "react";
import { CrudManager, type FieldSpec } from "@/components/admin/CrudManager";
import { RequireRole } from "@/components/admin/AdminShell";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { setDemoCollection, useDemoCollection, type DemoUser, type UserRole } from "@/lib/demoStore";
import { useAdminSession } from "@/hooks/useAdminSession";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<UserRole, string> = {
  admin: "bg-foreground text-background",
  manager: "bg-google-blue text-white",
  member: "bg-card text-foreground",
};

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Display name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  {
    name: "role",
    label: "Role",
    type: "select",
    required: true,
    options: [
      { value: "admin", label: "Admin — full access" },
      { value: "manager", label: "Manager — content only" },
      { value: "member", label: "Member — no admin access" },
    ],
  },
];

function UsersManager() {
  const users = useDemoCollection("users");
  const session = useAdminSession();
  const isSelf = (user: DemoUser) => user.email.toLowerCase() === session?.email;
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="space-y-5">
      <DemoNotice>
        These are <strong className="font-bold">mock user records</strong> for exploring the role-management screen.
        Changing them does not create real accounts or change who can sign in — only the two public demo accounts can.
      </DemoNotice>
      <CrudManager<DemoUser>
        singular="User"
        items={users}
        onChange={(next) => setDemoCollection("users", next)}
        titleField="email"
        fields={FIELDS}
        createItem={() => ({ id: `user-${Date.now().toString(36)}`, name: "", email: "", role: "member" })}
        validate={(draft, { items, editingId }) => {
          const errors: Record<string, string> = {};
          const email = String(draft.email).trim().toLowerCase();
          if (email && items.some((u) => u.id !== editingId && u.email.toLowerCase() === email))
            errors.email = "A user with this email already exists.";
          const original = items.find((u) => u.id === editingId);
          if (original && isSelf(original) && draft.role !== original.role)
            errors.role = "You can't change the role of the account you're signed in with.";
          else if (original?.role === "admin" && draft.role !== "admin" && adminCount <= 1)
            errors.role = "At least one admin must remain.";
          return errors;
        }}
        deleteBlockedReason={(user) =>
          isSelf(user)
            ? "You can't delete the account you're signed in with."
            : user.role === "admin" && adminCount <= 1
              ? "At least one admin must remain."
              : null
        }
        columns={[
          {
            header: "User",
            render: (u) => (
              <>
                <span className="font-heading font-bold">{u.name}</span>
                {isSelf(u) && <span className="ml-2 font-pixel text-[8px] text-google-green uppercase">(you)</span>}
                <span className="block font-mono text-[11px] text-muted-foreground">{u.email}</span>
              </>
            ),
          },
          {
            header: "Role",
            render: (u) => (
              <span className={cn("px-2.5 py-1 rounded-full border-2 border-foreground font-heading font-black text-[10px] uppercase tracking-wider", ROLE_STYLES[u.role])}>
                {u.role}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireRole role="admin">
      <UsersManager />
    </RequireRole>
  );
}
