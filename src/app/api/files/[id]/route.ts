import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { resolveUpload } from "@/lib/uploads";

// Serves an uploaded Document from the local /uploads folder.
// PDFs and images open in the browser (previews); ?download=1 always downloads.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const doc = Number.isInteger(id) ? await prisma.document.findUnique({ where: { id } }) : null;
  if (!doc) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(resolveUpload(doc.storagePath));
    // Only PDFs and images open in the browser; anything else downloads.
    const previewable = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(doc.mimeType ?? "");
    const inline = previewable && new URL(req.url).searchParams.get("download") !== "1";
    return new Response(data, {
      headers: {
        "Content-Type": previewable ? doc.mimeType! : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing on disk", { status: 404 });
  }
}
