"use client";

import React, { useId, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { inputClass } from "@/components/auth/LoginForm";
import { cn } from "@/lib/utils";
import { FallbackImage } from "@/components/ui/FallbackImage";

export type FieldType = "text" | "textarea" | "select" | "number" | "date" | "url" | "email" | "checkbox" | "tags" | "image";

/** Result of an image upload (backend screens): the stored file's public URL. */
export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  /** Only editable when creating (e.g. the URL slug). */
  createOnly?: boolean;
  wide?: boolean;
}

export type Draft = Record<string, string | boolean>;
export type Errors = Record<string, string>;

export interface Column<T> {
  header: string;
  render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  className?: string;
}

/** Result of a backend save: `partial` means part of the operation was stored and `error` says which part failed. */
export type SaveOutcome<T> =
  | { ok: true; item?: T }
  | { ok: "partial"; item: T; error: string; errors?: Errors }
  | { ok: false; error: string; errors?: Errors };

export interface CrudManagerProps<T extends { id: string }> {
  singular: string;
  items: T[];
  /** Demo screens: hands back the whole array after each change. */
  onChange?: (items: T[]) => void;
  /** Backend screens (P2.4): per-record async saves, used instead of onChange at the same save paths. */
  onCreate?: (item: T) => Promise<SaveOutcome<T>>;
  onUpdate?: (item: T, previous: T) => Promise<SaveOutcome<T>>;
  onDelete?: (item: T) => Promise<SaveOutcome<T>>;
  /** Per-record fields (e.g. one form per content section); defaults to `fields`. */
  fieldsFor?: (item: T) => FieldSpec[];
  /** Hide the ADD button / the Delete buttons (fixed record sets such as page sections). */
  canCreate?: boolean;
  canDelete?: boolean;
  /** Hide the Edit button for some records (e.g. archived messages, which are final). */
  canEdit?: (item: T) => boolean;
  /** Backend screens: uploads a photo for an `image` field and returns its URL (the field then holds that URL). */
  uploadImage?: (file: File, draft: Draft, isCreate: boolean) => Promise<UploadResult>;
  /** Dialog texts; the defaults are the demo wording. */
  editDescription?: string;
  deleteDescription?: (item: T) => string;
  columns: Column<T>[];
  fields: FieldSpec[];
  /** Field used for display names, search and the auto-generated id. */
  titleField: keyof T & string;
  createItem: () => T;
  validate?: (draft: Draft, context: { items: T[]; editingId: string | null }) => Errors;
  /** Return a reason to block deletion, or null to allow it. */
  deleteBlockedReason?: (item: T) => string | null;
}

const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function toDraft<T>(item: T, fields: FieldSpec[]): Draft {
  const record = item as Record<string, unknown>;
  const draft: Draft = {};
  for (const field of fields) {
    const value = record[field.name];
    if (field.type === "checkbox") draft[field.name] = Boolean(value);
    else if (field.type === "tags") draft[field.name] = Array.isArray(value) ? value.join(", ") : "";
    else draft[field.name] = value === undefined || value === null ? "" : String(value);
  }
  return draft;
}

function fromDraft<T>(draft: Draft, base: T, fields: FieldSpec[]): T {
  const result = { ...(base as Record<string, unknown>) };
  for (const field of fields) {
    const value = draft[field.name];
    if (field.type === "checkbox") {
      result[field.name] = Boolean(value);
      continue;
    }
    const text = String(value ?? "").trim();
    if (!text && !field.required) {
      delete result[field.name];
    } else if (field.type === "number") {
      result[field.name] = Number(text);
    } else if (field.type === "tags") {
      result[field.name] = text.split(",").map((t) => t.trim()).filter(Boolean);
    } else {
      result[field.name] = text;
    }
  }
  return result as T;
}

function baseValidate(draft: Draft, fields: FieldSpec[], isCreate: boolean, existingIds: string[]): Errors {
  const errors: Errors = {};
  for (const field of fields) {
    if (field.type === "checkbox") continue;
    if (field.createOnly && !isCreate) continue;
    const text = String(draft[field.name] ?? "").trim();
    if (!text) {
      if (field.required) errors[field.name] = `${field.label} is required.`;
      continue;
    }
    // same rule as the API: a site path can't start with // or /\ (a protocol-relative link to another host)
    if ((field.type === "url" || field.type === "image") && !(URL_PATTERN.test(text) || /^\/(?![/\\])[^\s\\]*$/.test(text)))
      errors[field.name] = "Enter a full URL (https://…) or a site path starting with /.";
    if (field.type === "email" && !EMAIL_PATTERN.test(text)) errors[field.name] = "Enter a valid email address.";
    if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))))
      errors[field.name] = "Enter a date as YYYY-MM-DD.";
    if (field.type === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) errors[field.name] = `${field.label} must be a number.`;
      else if (field.min !== undefined && n < field.min) errors[field.name] = `${field.label} must be at least ${field.min}.`;
      else if (field.max !== undefined && n > field.max) errors[field.name] = `${field.label} must be at most ${field.max}.`;
    }
    if (field.name === "id" && isCreate) {
      if (!SLUG_PATTERN.test(text)) errors.id = "Use lowercase letters, numbers and hyphens only.";
      else if (existingIds.includes(text)) errors.id = "That ID is already in use.";
    }
  }
  return errors;
}

// Image previews only for sources next/image serves (next.config.ts): site files, YouTube thumbnails and this
// project's uploaded photos; anything else shows the initials placeholder instead of breaking the dialog.
const MEDIA_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/site-media/` : null;
const previewable = (v: string) => /^\/[A-Za-z0-9]/.test(v) || v.startsWith("https://img.youtube.com/") || (!!MEDIA_PREFIX && v.startsWith(MEDIA_PREFIX));

/** Photo field (backend screens): preview, the path/URL text input, a file upload and "Remove photo". */
function ImageInput({ field, value, error, onChange, idPrefix, onUpload, describedBy, common }: {
  field: FieldSpec;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  idPrefix: string;
  onUpload?: (file: File) => Promise<UploadResult>;
  describedBy?: string;
  common: Record<string, unknown>;
}) {
  const id = `${idPrefix}-${field.name}`;
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUpload) return;
    setBusy(true);
    setUploadError("");
    const result = await onUpload(file);
    setBusy(false);
    if (result.ok) onChange(result.url);
    else setUploadError(result.error);
  };
  return (
    <div className={cn("space-y-1.5", field.wide && "sm:col-span-2")}>
      <label htmlFor={id} className="block font-heading font-bold text-xs uppercase tracking-wider">
        {field.label}
        {field.required && <span className="text-google-red" aria-hidden="true"> *</span>}
      </label>
      <div className="flex items-start gap-3">
        <div className="relative w-20 h-20 shrink-0 rounded-xl border-2 border-foreground overflow-hidden bg-muted">
          <FallbackImage key={value} src={value && previewable(value) ? value : undefined} alt="" fallbackName={field.label} fill className="object-cover" sizes="80px" fallbackClassName="text-xl" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input {...common} type="text" inputMode="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Upload a file, or /images/…" className={inputClass} aria-describedby={describedBy} />
          {onUpload && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pick}
                disabled={busy}
                aria-label={`Upload ${field.label}`}
                className={cn(inputClass, "py-1.5 text-xs")}
              />
              {value && (
                <button type="button" onClick={() => onChange("")} disabled={busy} className={cn(smallButton, "text-google-red")}>
                  Remove photo
                </button>
              )}
            </div>
          )}
          {busy && <p role="status" className="font-mono text-xs text-muted-foreground">Uploading…</p>}
          {uploadError && <p role="alert" className="font-body text-xs text-google-red">{uploadError}</p>}
        </div>
      </div>
      {field.help && (
        <p id={`${id}-help`} className="font-body text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="font-body text-xs text-google-red">
          {error}
        </p>
      )}
    </div>
  );
}

function FieldInput({ field, value, error, onChange, idPrefix, onUpload }: {
  field: FieldSpec;
  value: string | boolean;
  error?: string;
  onChange: (value: string | boolean) => void;
  idPrefix: string;
  onUpload?: (file: File) => Promise<UploadResult>;
}) {
  const id = `${idPrefix}-${field.name}`;
  const describedBy = [error && `${id}-error`, field.help && `${id}-help`].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: field.name,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
  };

  if (field.type === "checkbox") {
    return (
      <div className={cn("flex items-start gap-3", field.wide && "sm:col-span-2")}>
        <input
          {...common}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-2 border-foreground accent-google-blue"
        />
        <label htmlFor={id} className="font-heading font-bold text-sm">
          {field.label}
          {field.help && (
            <span id={`${id}-help`} className="block font-body font-normal text-xs text-muted-foreground">
              {field.help}
            </span>
          )}
          {error && (
            <span id={`${id}-error`} className="block font-body font-normal text-xs text-google-red">
              {error}
            </span>
          )}
        </label>
      </div>
    );
  }

  if (field.type === "image") {
    return <ImageInput field={field} value={String(value)} error={error} onChange={onChange} idPrefix={idPrefix} onUpload={onUpload} describedBy={describedBy} common={common} />;
  }

  const text = String(value);
  return (
    <div className={cn("space-y-1.5", field.wide && "sm:col-span-2")}>
      <label htmlFor={id} className="block font-heading font-bold text-xs uppercase tracking-wider">
        {field.label}
        {field.required && <span className="text-google-red" aria-hidden="true"> *</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea {...common} rows={4} value={text} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputClass} />
      ) : field.type === "select" ? (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === "url" || field.type === "tags" ? "text" : field.type}
          inputMode={field.type === "url" ? "url" : undefined}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
      {field.help && (
        <p id={`${id}-help`} className="font-body text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="font-body text-xs text-google-red">
          {error}
        </p>
      )}
    </div>
  );
}

const smallButton =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-foreground bg-card font-heading font-bold text-[11px] uppercase tracking-wider hover:-translate-y-px transition-transform";

export function CrudManager<T extends { id: string }>({
  singular,
  items,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
  editDescription,
  deleteDescription,
  fieldsFor,
  canCreate = true,
  canDelete = true,
  canEdit,
  uploadImage,
  columns,
  fields,
  titleField,
  createItem,
  validate,
  deleteBlockedReason,
}: CrudManagerProps<T>) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: T; isCreate: boolean } | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Errors>({});
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = useId();

  const nameOf = (item: T) => String((item as Record<string, unknown>)[titleField] ?? item.id);
  const visible = items.filter((item) => nameOf(item).toLowerCase().includes(query.trim().toLowerCase()));
  const fieldsOf = (item: T) => fieldsFor?.(item) ?? fields;
  const formFields = editing ? fieldsOf(editing.item).filter((f) => editing.isCreate || !f.createOnly) : [];

  const openEditor = (item: T, isCreate: boolean) => {
    setEditing({ item, isCreate });
    setDraft(toDraft(item, fieldsOf(item)));
    setErrors({});
  };

  const update = (id: string, patch: Partial<T>) => {
    if (onUpdate) {
      // backend screens: an inline table control saves like the edit dialog, and reports the result
      const item = items.find((i) => i.id === id);
      if (!item || pending) return;
      setStatus("");
      setPending(true);
      void onUpdate({ ...item, ...patch }, item).then((outcome) => {
        setPending(false);
        setStatus(outcome.ok === true ? `${singular} "${nameOf(item)}" saved.` : `${singular} "${nameOf(item)}" not saved: ${outcome.error}`);
      });
      return;
    }
    onChange?.(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const focusFirstInvalid = (nextErrors: Errors) => {
    const firstInvalid = formFields.find((f) => nextErrors[f.name]);
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid.name}"]`)?.focus();
  };

  const generatedId = (d: Draft, taken: string[]) => {
    const base = slugify(String(d[titleField] ?? "")) || singular.toLowerCase();
    let candidate = base;
    for (let n = 2; taken.includes(candidate); n++) candidate = `${base}-${n}`;
    return candidate;
  };

  // An upload is filed under the record's ID, so on create a blank ID is generated (as on save) and kept: a later
  // title change or an ID already in use can't move the record away from its uploaded photo's folder.
  const uploadFor = (file: File): Promise<UploadResult> => {
    if (!uploadImage || !editing) return Promise.resolve({ ok: false, error: "Uploads aren't available here." });
    if (!editing.isCreate) return uploadImage(file, { ...draft, id: editing.item.id }, false);
    const blank = fields.some((f) => f.name === "id") && !String(draft.id ?? "").trim() && String(draft[titleField] ?? "").trim();
    if (!blank) return uploadImage(file, draft, true);
    const id = generatedId(draft, items.map((i) => i.id));
    return uploadImage(file, { ...draft, id }, true).then((result) => {
      if (result.ok) setDraft((d) => (String(d.id ?? "").trim() ? d : { ...d, id }));
      return result;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || pending) return;
    const { isCreate } = editing;
    const otherIds = items.filter((i) => i.id !== editing.item.id).map((i) => i.id);

    // A blank ID on create is generated from the title
    const workingDraft = { ...draft };
    if (isCreate && fields.some((f) => f.name === "id") && !String(workingDraft.id ?? "").trim()) workingDraft.id = generatedId(workingDraft, otherIds);

    const nextErrors = {
      ...baseValidate(workingDraft, formFields, isCreate, otherIds),
      ...(validate?.(workingDraft, { items, editingId: isCreate ? null : editing.item.id }) ?? {}),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors);
      return;
    }

    const saved = fromDraft(workingDraft, editing.item, formFields);
    const persist = isCreate ? onCreate : onUpdate;
    if (persist) {
      // a stale success line must never sit next to a failed or partial save
      setStatus("");
      setPending(true);
      const outcome = await persist(saved, editing.item);
      setPending(false);
      if (outcome.ok === true) {
        setStatus(`${singular} "${nameOf(outcome.item ?? saved)}" ${isCreate ? "added" : "saved"}.`);
        setEditing(null);
      } else if (outcome.ok === "partial") {
        // part of the change is stored: show the record as it is now saved, and say what failed
        setEditing({ item: outcome.item, isCreate: false });
        setDraft(toDraft(outcome.item, fieldsOf(outcome.item)));
        setErrors({ ...outcome.errors, form: outcome.error });
      } else {
        const serverErrors = { ...outcome.errors, form: outcome.errors?.form ?? outcome.error };
        setErrors(serverErrors);
        focusFirstInvalid(serverErrors);
      }
      return;
    }
    onChange?.(isCreate ? [...items, saved] : items.map((i) => (i.id === editing.item.id ? saved : i)));
    setStatus(`${singular} "${nameOf(saved)}" ${isCreate ? "added" : "saved"}.`);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting || pending) return;
    if (onDelete) {
      setStatus("");
      setPending(true);
      const outcome = await onDelete(deleting);
      setPending(false);
      if (outcome.ok !== true) {
        setDeleteError(outcome.error);
        return;
      }
    } else {
      onChange?.(items.filter((i) => i.id !== deleting.id));
    }
    setStatus(`${singular} "${nameOf(deleting)}" deleted.`);
    setDeleting(null);
  };

  const closeDelete = () => {
    if (pending) return;
    setDeleting(null);
    setDeleteError("");
  };

  const blockedReason = deleting ? deleteBlockedReason?.(deleting) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search ${singular.toLowerCase()} records`}
            placeholder="Search…"
            className={`${inputClass} pl-10`}
          />
        </div>
        {canCreate && (
        <button
          type="button"
          onClick={() => openEditor(createItem(), true)}
          className="btn-brutal px-5 py-2.5 text-xs bg-google-blue text-white gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          ADD {singular.toUpperCase()}
        </button>
        )}
      </div>

      <p role="status" aria-live="polite" className={cn("font-mono text-xs text-google-green", !status && "sr-only")}>
        {status}
      </p>

      <div className="rounded-[20px] border-[3px] border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-x-auto">
        <table className="w-full min-w-[640px] text-left font-body text-sm">
          <caption className="sr-only">
            {singular} records ({visible.length} shown of {items.length})
          </caption>
          <thead className="bg-foreground text-background font-heading text-[11px] uppercase tracking-wider">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn("px-4 py-3 font-bold", c.className)}>
                  {c.header}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 font-bold text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id} className="border-t-2 border-foreground/10 align-top">
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-4 py-3", c.className)}>
                    {c.render(item, (patch) => update(item.id, patch))}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {(canEdit?.(item) ?? true) && (
                    <button type="button" onClick={() => openEditor(item, false)} className={smallButton} aria-label={`Edit ${nameOf(item)}`}>
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit
                    </button>
                    )}
                    {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setDeleting(item);
                      }}
                      className={cn(smallButton, "text-google-red")}
                      aria-label={`Delete ${nameOf(item)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-muted-foreground">
                  {items.length === 0 ? `No ${singular.toLowerCase()} records yet.` : "No records match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => !pending && setEditing(null)}
        title={editing?.isCreate ? `Add ${singular}` : `Edit ${singular}`}
        description={editDescription ?? "Mock data — saved only in this browser."}
        className="max-w-2xl"
      >
        <form ref={formRef} onSubmit={handleSave} noValidate className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {formFields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                idPrefix={idPrefix}
                value={draft[field.name] ?? ""}
                error={errors[field.name]}
                onChange={(value) => setDraft((d) => ({ ...d, [field.name]: value }))}
                // when editing, the record's real id files the upload (the form may not include an id field)
                onUpload={uploadImage && editing ? uploadFor : undefined}
              />
            ))}
          </div>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="font-body text-sm text-google-red">
              {errors.form ?? "Fix the highlighted fields and try again."}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} disabled={pending} className="btn-glass px-5 py-2.5 text-xs">
              CANCEL
            </button>
            <button type="submit" disabled={pending} className="btn-brutal px-5 py-2.5 text-xs bg-foreground text-background">
              {editing?.isCreate ? `ADD ${singular.toUpperCase()}` : "SAVE CHANGES"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!deleting}
        onClose={closeDelete}
        title={blockedReason ? "Can't delete" : `Delete ${singular}?`}
        description={
          deleting &&
          (blockedReason ??
            (deleteDescription
              ? deleteDescription(deleting)
              : `"${nameOf(deleting)}" will be removed from this browser's demo data. The public site is not affected.`))
        }
      >
        {deleteError && (
          <p role="alert" className="font-body text-sm text-google-red mb-4">
            {deleteError}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={closeDelete} disabled={pending} className="btn-glass px-5 py-2.5 text-xs" data-autofocus>
            {blockedReason ? "OK" : "CANCEL"}
          </button>
          {!blockedReason && (
            <button type="button" onClick={confirmDelete} disabled={pending} className="btn-brutal px-5 py-2.5 text-xs bg-google-red text-white">
              DELETE
            </button>
          )}
        </div>
      </Dialog>
    </div>
  );
}
