"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CrudManager, type Draft, type Errors, type FieldSpec, type SaveOutcome } from "@/components/admin/CrudManager";
import { statusLine } from "@/components/admin/BackendCollection";
import { cn } from "@/lib/utils";

/**
 * HOD messages (Faculty Manager, CMS backend only), through the existing /api/admin/hod-messages routes.
 * Workflow (enforced by the API, with the database rules underneath): draft → approved (who approved the final
 * wording, and when) → published → archived. Wording can change only while a draft; an approved message can go back
 * to draft (its approval is cleared); archived is final; messages are never deleted. Only the current, published
 * active HOD's message can be published, and only one at a time (database rules). The wording itself must be the
 * HOD's own text, supplied and approved by the department; nothing here writes or suggests it.
 */

export type MessageStatus = "draft" | "approved" | "published" | "archived";

interface HodMessage {
  id: string;
  facultyId: string;
  message: string;
  status: MessageStatus;
  approvedBy: string | null;
  approvedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = HodMessage & { label: string };

const STATUS_LABEL: Record<MessageStatus, string> = { draft: "Draft", approved: "Approved", published: "Published", archived: "Archived" };
const STATUS_STYLE: Record<MessageStatus, string> = {
  draft: "bg-card text-foreground",
  approved: "bg-google-yellow text-foreground",
  published: "bg-google-green text-white",
  archived: "bg-muted text-muted-foreground",
};
const NEXT: Record<MessageStatus, MessageStatus[]> = {
  draft: ["draft", "approved", "archived"],
  approved: ["approved", "published", "draft", "archived"],
  published: ["published", "archived"],
  archived: [],
};

type CallResult = { ok: true; data: unknown } | { ok: false; error: string; errors?: Errors };

async function call(method: string, path: string, body?: unknown): Promise<CallResult> {
  try {
    const r = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: json?.data };
    return { ok: false, error: typeof json?.error === "string" ? json.error : `Request failed (${r.status}).`, errors: json?.errors };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

const statusField = (current: MessageStatus): FieldSpec => ({
  name: "status",
  label: "Status",
  type: "select",
  required: true,
  options: NEXT[current].map((s) => ({ value: s, label: s === current ? `${STATUS_LABEL[s]} (current)` : STATUS_LABEL[s] })),
  help:
    current === "draft"
      ? "Approve only the final wording, as supplied and approved by the department."
      : current === "approved"
        ? "Publishing shows it on the About page (the faculty record must be the published, active HOD). Back to draft clears the approval."
        : current === "published"
          ? "Archiving removes it from the About page. Archived messages are final."
          : undefined,
});

const APPROVAL_FIELDS: FieldSpec[] = [
  { name: "approvedBy", label: "Approved by", type: "text", help: "Who confirmed this is the HOD's own, final wording (required to approve)." },
  { name: "approvedOn", label: "Approved on", type: "date" },
];

export function HodMessages({ faculty }: { faculty: { id: string; name: string; isActiveHod: boolean }[] }) {
  const [messages, setMessages] = useState<HodMessage[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const r = await call("GET", "/api/admin/hod-messages");
    if (!r.ok) setError(r.error);
    else {
      setError("");
      setMessages(Array.isArray(r.data) ? (r.data as HodMessage[]) : []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) return <p role="alert" className={statusLine}>{`Couldn't load HOD messages. ${error}`}</p>;
  if (!messages) return <p role="status" className={statusLine}>Loading HOD messages…</p>;

  const nameOf = (id: string) => faculty.find((f) => f.id === id)?.name ?? id;
  const rows: Row[] = messages.map((m) => ({ ...m, label: `${nameOf(m.facultyId)}: ${m.message.slice(0, 40)}` }));

  const createFields: FieldSpec[] = [
    {
      name: "facultyId",
      label: "Faculty member",
      type: "select",
      required: true,
      options: faculty.map((f) => ({ value: f.id, label: f.isActiveHod ? `${f.name} (active HOD)` : f.name })),
    },
    { name: "message", label: "Message (the HOD's own words)", type: "textarea", required: true, wide: true },
  ];
  const fieldsFor = (row: Row): FieldSpec[] => {
    if (!row.id) return createFields;
    if (row.status === "draft") return [{ name: "message", label: "Message (the HOD's own words)", type: "textarea", required: true, wide: true }, statusField("draft"), ...APPROVAL_FIELDS];
    return [statusField(row.status)];
  };

  const validate = (draft: Draft, { editingId }: { editingId: string | null }): Errors => {
    const errors: Errors = {};
    const current = rows.find((r) => r.id === editingId);
    if (current?.status === "draft" && draft.status === "approved") {
      if (!String(draft.approvedBy ?? "").trim()) errors.approvedBy = "Record who approved the final wording.";
      if (!String(draft.approvedOn ?? "").trim()) errors.approvedOn = "Enter the approval date.";
    }
    return errors;
  };

  const outcome = async (r: CallResult, item: Row): Promise<SaveOutcome<Row>> => {
    await refresh();
    return r.ok ? { ok: true, item } : { ok: false, error: r.error, errors: r.errors };
  };

  const create = async (item: Row) => outcome(await call("POST", "/api/admin/hod-messages", { facultyId: item.facultyId, message: item.message }), item);

  const update = async (item: Row, previous: Row) => {
    const body: Record<string, unknown> = {};
    if (previous.status === "draft" && item.message !== previous.message) body.message = item.message;
    if (item.status !== previous.status) body.status = item.status;
    if (previous.status === "draft" && item.status === "approved") {
      body.approvedBy = item.approvedBy;
      body.approvedOn = item.approvedOn;
    }
    if (Object.keys(body).length === 0) return { ok: true as const, item };
    return outcome(await call("PATCH", `/api/admin/hod-messages/${encodeURIComponent(item.id)}`, body), item);
  };

  return (
    <section aria-labelledby="hod-messages-heading" className="space-y-4">
      <h2 id="hod-messages-heading" className="font-heading font-bold text-base">HOD messages</h2>
      <CrudManager<Row>
        singular="HOD message"
        items={rows}
        titleField="label"
        fields={createFields}
        fieldsFor={fieldsFor}
        canDelete={false}
        canEdit={(r) => r.status !== "archived"}
        createItem={() => ({
          id: "",
          facultyId: faculty.find((f) => f.isActiveHod)?.id ?? faculty[0]?.id ?? "",
          message: "",
          status: "draft",
          approvedBy: null,
          approvedOn: null,
          createdAt: "",
          updatedAt: "",
          label: "",
        })}
        validate={validate}
        onCreate={create}
        onUpdate={update}
        editDescription="Saved to the Sophia Forum CMS."
        columns={[
          { header: "Faculty", render: (r) => <span className="font-heading font-bold">{nameOf(r.facultyId)}</span> },
          {
            header: "Status",
            render: (r) => (
              <span className={cn("px-2.5 py-1 rounded-full border-2 border-foreground font-heading font-black text-[10px] tracking-wider uppercase", STATUS_STYLE[r.status])}>
                {STATUS_LABEL[r.status]}
              </span>
            ),
          },
          { header: "Message", render: (r) => <span className="text-muted-foreground">{r.message.length > 140 ? `${r.message.slice(0, 140)}…` : r.message}</span>, className: "max-w-[420px]" },
          {
            header: "Approved",
            render: (r) => <span className="font-mono text-xs">{r.approvedBy ? `${r.approvedBy} · ${r.approvedOn ?? ""}` : "—"}</span>,
          },
        ]}
      />
    </section>
  );
}
