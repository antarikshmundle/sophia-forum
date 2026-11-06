"use client";

import React from "react";
import type { Draft, FieldSpec, SaveOutcome, UploadResult } from "@/components/admin/CrudManager";
import { draftRecordId, uploadMedia } from "@/hooks/uploadMedia";
import { useCmsRecords, type CmsResource } from "@/hooks/useCmsRecords";
import { RESERVED_ID_ERROR, RESERVED_RECORD_IDS } from "@/lib/cms/media-path";

/** The backend-mode field added to the existing Team, Events and Gallery forms (same as Faculty's F2). */
export const PUBLISHED_FIELD: FieldSpec = { name: "isPublished", label: "Published", type: "checkbox" };

/** Backend forms: the given photo fields become upload fields (preview, upload, remove). */
export const withImageFields = (fields: FieldSpec[], keys: string[]): FieldSpec[] =>
  fields.map((f) => (keys.includes(f.name) ? { ...f, type: "image" as const } : f));

export const statusLine = "py-20 text-center font-pixel text-xs text-muted-foreground";

export interface BackendProps<T> {
  items: T[];
  onCreate: (item: T) => Promise<SaveOutcome<T>>;
  onUpdate: (item: T, previous: T) => Promise<SaveOutcome<T>>;
  onDelete: (item: T) => Promise<SaveOutcome<T>>;
  editDescription: string;
  deleteDescription: (item: T) => string;
  uploadImage: (file: File, draft: Draft) => Promise<UploadResult>;
}

/**
 * Loads one collection from the CMS API and hands the existing manager its backend props: the stored records,
 * per-record saves, and the CMS dialog texts. Loading and load errors use the Faculty Manager's states; the demo
 * store is never read here.
 */
export function BackendCollection<T extends { id: string }>({
  resource,
  titleField,
  label,
  children,
}: {
  resource: CmsResource;
  titleField: keyof T & string;
  label: string;
  children: (props: BackendProps<T>) => React.ReactNode;
}) {
  const { load, create, update, remove } = useCmsRecords<T>(resource);
  if (load.status === "loading") return <p role="status" className={statusLine}>{`Loading ${label}…`}</p>;
  if (load.status === "error") return <p role="alert" className={statusLine}>{`Couldn't load ${label}. ${load.error}`}</p>;
  return (
    <>
      {children({
        items: load.items,
        onCreate: create,
        onUpdate: update,
        onDelete: remove,
        editDescription: "Saved to the Sophia Forum CMS.",
        deleteDescription: (item) => `"${String((item as Record<string, unknown>)[titleField] ?? item.id)}" will be permanently deleted from the CMS.`,
        uploadImage: (file, draft) => {
          // checked before the upload request: a reserved id's folder belongs to site content (the API refuses the record too)
          const id = draftRecordId(draft, titleField);
          if (RESERVED_RECORD_IDS[resource]?.includes(id)) return Promise.resolve({ ok: false as const, error: RESERVED_ID_ERROR });
          return uploadMedia(resource, id, file);
        },
      })}
    </>
  );
}
