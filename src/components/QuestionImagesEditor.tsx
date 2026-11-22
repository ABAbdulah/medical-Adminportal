import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { BankImage, ImageRole } from "../lib/admin-types";
import { Alert, Badge, Button, Input, Select } from "./ui";

/*
 * A question's pictures (ECGs, X-rays, photos). Changes are saved at once,
 * separately from the question form's Save button: the files go to private
 * storage and students get signed links.
 *  - "With the question" (stem): the stem refers to it ("shown below").
 *  - "After answering" (teaching): a labelled copy or comparison photo.
 * The caption is shown to students with the picture: keep the photographer
 * credit and licence in it (Wikimedia CC BY / BY-SA require them).
 * Delete removes the picture from this question only.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ROLE_LABEL: Record<ImageRole, string> = { stem: "With the question", teaching: "After answering" };

export function QuestionImagesEditor({ questionId }: { questionId: number }) {
  const qc = useQueryClient();
  const key = ["admin", "question-images", questionId];
  const images = useQuery({ queryKey: key, queryFn: () => api.get<BankImage[]>(`/api/admin/questions/${questionId}/images`) });
  const [role, setRole] = useState<ImageRole>("stem");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<BankImage | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function upload(file: File, as: ImageRole, text: string): Promise<boolean> {
    if (file.size > MAX_BYTES) {
      setError("Pictures must be 5 MB or smaller.");
      return false;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("role", as);
    form.append("caption", text);
    await api.upload(`/api/admin/questions/${questionId}/images`, form);
    return true;
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  function onAdd(file: File | undefined) {
    if (!file) return;
    void run(async () => {
      if (await upload(file, role, caption.trim())) setCaption("");
    });
  }

  function onReplace(file: File | undefined) {
    const old = replacing;
    setReplacing(null);
    if (!file || !old) return;
    // new picture first, then the old row, so a failed upload loses nothing
    void run(async () => {
      if (await upload(file, old.role, old.caption)) {
        await api.delete(`/api/admin/questions/${questionId}/images/${old.id}`);
      }
    });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">
        Pictures <span className="font-normal text-muted">— saved immediately; students see the caption with the picture</span>
      </legend>
      {error && <Alert>{error}</Alert>}
      {images.isError && <Alert>Could not load the pictures.</Alert>}
      {images.data?.length === 0 && <p className="text-xs text-muted">No pictures.</p>}
      {images.data?.map((img) => (
        <ImageRow key={img.id} image={img} questionId={questionId} busy={busy} run={run}
          onReplace={() => { setReplacing(img); replaceRef.current?.click(); }} />
      ))}
      <input ref={replaceRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
        <Select aria-label="Where the picture is shown" value={role} className="w-44"
          onChange={(e) => setRole(e.target.value as ImageRole)}>
          <option value="stem">{ROLE_LABEL.stem}</option>
          <option value="teaching">{ROLE_LABEL.teaching}</option>
        </Select>
        <Input aria-label="Caption" value={caption} maxLength={600} className="min-w-[14rem] flex-1"
          placeholder="Caption, e.g. Chest X-ray. Image: A. Author, CC BY-SA 4.0, via Wikimedia Commons."
          onChange={(e) => setCaption(e.target.value)} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { onAdd(e.target.files?.[0]); e.target.value = ""; }} />
        <Button variant="outline" size="sm" loading={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" /> Add picture
        </Button>
      </div>
      <p className="text-xs text-muted">PNG, JPEG or WebP, up to 5 MB.</p>
    </fieldset>
  );
}

function ImageRow({ image, questionId, busy, run, onReplace }: {
  image: BankImage;
  questionId: number;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
  onReplace: () => void;
}) {
  const [caption, setCaption] = useState(image.caption);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = `/api/admin/questions/${questionId}/images/${image.id}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row">
      <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded bg-white sm:w-40">
        {image.url ? (
          <a href={image.url} target="_blank" rel="noopener noreferrer" title="Open full size">
            <img src={image.url} alt={image.caption || "Question picture"} referrerPolicy="no-referrer"
              className="max-h-24 max-w-full object-contain" />
          </a>
        ) : (
          <span className="px-2 text-center text-xs text-muted">Storage not configured</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={image.role === "stem" ? "accent" : "neutral"}>{ROLE_LABEL[image.role]} #{image.position}</Badge>
          <span className="text-muted">{image.width}×{image.height} · {Math.round(image.bytes / 1024)} KB</span>
        </div>
        <Input aria-label="Caption" value={caption} maxLength={600} onChange={(e) => setCaption(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={busy || caption === image.caption}
            onClick={() => void run(() => api.patch(base, { caption }))}>
            Save caption
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReplace}>
            <RefreshCw className="h-3.5 w-3.5" /> Replace
          </Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="danger" disabled={busy}
                onClick={() => void run(() => api.delete(base))}>
                Remove picture
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
