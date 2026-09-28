import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { resolveUpload } from "@/lib/uploads";

// Serves an uploaded Document from the local /uploads folder.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const doc = Number.isInteger(id) ? await prisma.document.findUnique({ where: { id } }) : null;
  if (!doc) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(resolveUpload(doc.storagePath));
    // Only PDFs and images open in the browser; anything else downloads.
    const inline = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(doc.mimeType ?? "");
    return new Response(data, {
      headers: {
        "Content-Type": inline ? doc.mimeType! : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing on disk", { status: 404 });
  }
}
