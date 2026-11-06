import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrudManager, type Draft, type FieldSpec, type SaveOutcome, type UploadResult } from "@/components/admin/CrudManager";

type Item = { id: string; name: string; poster: string };

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Event name", type: "text", required: true },
  { name: "id", label: "URL slug", type: "text", createOnly: true },
  { name: "poster", label: "Poster", type: "image", required: true },
];

const EXISTING: Item[] = [{ id: "debate-competition", name: "Debate Competition", poster: "/images/debate.png" }];

// Files the upload under the folder it is given, as the real /api/admin/uploads does
const uploadTo = (draft: Draft) => `/uploads/events/${String(draft.id)}/photo.png`;

type Upload = (file: File, draft: Draft, isCreate: boolean) => Promise<UploadResult>;
type Save = (item: Item, previous?: Item) => Promise<SaveOutcome<Item>>;
const uploadMock = (impl: Upload) => vi.fn<Upload>(impl);
const saveMock = (impl: Save = async () => ({ ok: true })) => vi.fn<Save>(impl);

function setup({
  items = EXISTING,
  upload = uploadMock(async (_f, draft) => ({ ok: true, url: uploadTo(draft) })),
  onCreate = saveMock(),
  onUpdate = saveMock(),
}: {
  items?: Item[];
  upload?: ReturnType<typeof uploadMock>;
  onCreate?: ReturnType<typeof saveMock>;
  onUpdate?: ReturnType<typeof saveMock>;
} = {}) {
  const user = userEvent.setup();
  render(
    <CrudManager<Item>
      singular="Event"
      items={items}
      fields={FIELDS}
      titleField="name"
      columns={[{ header: "Event", render: (i) => i.name }]}
      createItem={() => ({ id: "", name: "", poster: "" })}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
      uploadImage={upload}
    />,
  );
  return { user, upload, onCreate, onUpdate };
}

const file = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "poster.png", { type: "image/png" });

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /add event/i }));
  return screen.getByRole("dialog");
}

describe("CrudManager — create with an uploaded photo", () => {
  it("files the upload under the next free ID when the generated slug is taken, and saves with that ID", async () => {
    const { user, upload, onCreate } = setup();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/event name/i), "Debate Competition");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());

    await waitFor(() => expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("debate-competition-2"));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toMatchObject({ id: "debate-competition-2" });
    expect(upload.mock.calls[0][2]).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: /^add event$/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ id: "debate-competition-2", poster: "/uploads/events/debate-competition-2/photo.png" });
  });

  it("skips every taken suffix", async () => {
    const items = [...EXISTING, { id: "debate-competition-2", name: "Debate Competition", poster: "/images/x.png" }];
    const { user, upload } = setup({ items });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/event name/i), "Debate Competition");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("debate-competition-3"));
    expect(upload.mock.calls[0][1]).toMatchObject({ id: "debate-competition-3" });
  });

  it("keeps the upload's ID when the name is changed after uploading", async () => {
    const { user, onCreate } = setup();
    const dialog = await openAdd(user);
    const name = within(dialog).getByLabelText(/event name/i);
    await user.type(name, "Spring Fest");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("spring-fest"));

    await user.clear(name);
    await user.type(name, "Spring Fest 2026");
    await user.click(within(dialog).getByRole("button", { name: /^add event$/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ id: "spring-fest", name: "Spring Fest 2026", poster: "/uploads/events/spring-fest/photo.png" });
  });

  it("uses a slug typed by the admin as it is", async () => {
    const { user, upload } = setup();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/event name/i), "Debate Competition");
    await user.type(within(dialog).getByLabelText(/url slug/i), "debate-2027");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][1]).toMatchObject({ id: "debate-2027" });
    expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("debate-2027");
  });

  it("leaves the slug blank and shows the error when the upload fails", async () => {
    const upload = uploadMock(async () => ({ ok: false, error: "Upload a JPEG, PNG or WebP image." }));
    const { user } = setup({ upload });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/event name/i), "Debate Competition");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    expect(await within(dialog).findByText("Upload a JPEG, PNG or WebP image.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("");
  });

  it("does not invent an ID when no name has been entered yet", async () => {
    const upload = uploadMock(async () => ({ ok: false, error: "Enter the name (or ID) first." }));
    const { user } = setup({ upload });
    const dialog = await openAdd(user);
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(String(upload.mock.calls[0]?.[1].id ?? "")).toBe("");
    expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("");
  });

  it("shows the server's field errors when the save is refused", async () => {
    const onCreate = saveMock(async () => ({ ok: false, error: "Please correct the highlighted fields.", errors: { poster: "Upload a photo, or use a site image path." } }));
    const { user } = setup({ onCreate });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/event name/i), "New Event");
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(within(dialog).getByLabelText(/url slug/i)).toHaveValue("new-event"));
    await user.click(within(dialog).getByRole("button", { name: /^add event$/i }));
    expect(await within(dialog).findByText("Upload a photo, or use a site image path.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CrudManager — edit", () => {
  it("files an upload under the record's own ID", async () => {
    const { user, upload, onUpdate } = setup();
    await user.click(screen.getByRole("button", { name: "Edit Debate Competition" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/url slug/i)).not.toBeInTheDocument();
    await user.upload(within(dialog).getByLabelText("Upload Poster"), file());
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][1]).toMatchObject({ id: "debate-competition" });
    expect(upload.mock.calls[0][2]).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ id: "debate-competition", poster: "/uploads/events/debate-competition/photo.png" });
    expect(onUpdate.mock.calls[0][1]).toEqual(EXISTING[0]);
  });
});
