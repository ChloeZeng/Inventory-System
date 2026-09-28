import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local file storage for the prototype. Later: cloud storage.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function saveUpload(file: File, subdir: string) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const relative = path.join(subdir, `${randomUUID()}-${safeName}`);
  const absolute = path.join(UPLOAD_ROOT, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));
  return { storagePath: relative, fileName: file.name, mimeType: file.type || null, sizeBytes: file.size };
}

export function resolveUpload(storagePath: string) {
  const absolute = path.resolve(UPLOAD_ROOT, storagePath);
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) throw new Error("Invalid path");
  return absolute;
}

// Uploaded files come in as empty File objects when the input was left blank.
export function fileFromForm(formData: FormData, name: string) {
  const f = formData.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}
