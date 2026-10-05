"use client";

import Image from "next/image";
import { useState } from "react";
import { Modal } from "@/components/modal";

export type GalleryDoc = {
  id: number;
  type: string;
  fileName: string;
  mimeType: string | null;
  scope: string; // e.g. "This lot", "Whole delivery REC-2026-001", "Item C-LID-010"
  uploadedBy: string;
  uploadedAt: string; // already formatted
};

const isImage = (d: GalleryDoc) => /^image\/(png|jpeg|gif|webp)$/.test(d.mimeType ?? "");
const isPdf = (d: GalleryDoc) => d.mimeType === "application/pdf";
const fileUrl = (d: GalleryDoc) => `/api/files/${d.id}`;
const downloadUrl = (d: GalleryDoc) => `/api/files/${d.id}?download=1`;

// Images show as thumbnails, PDFs as a file icon; click to preview in a window
// (no download needed). Every file keeps a Download button.
export function DocumentGallery({ docs }: { docs: GalleryDoc[] }) {
  const [preview, setPreview] = useState<GalleryDoc | null>(null);
  if (!docs.length) return <p className="text-sm text-slate-500">No documents yet.</p>;

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((d) => {
          const canPreview = isImage(d) || isPdf(d);
          return (
            <li key={d.id} className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => canPreview && setPreview(d)}
                disabled={!canPreview}
                className="relative flex h-36 items-center justify-center bg-slate-100 disabled:cursor-default"
                aria-label={canPreview ? `Preview ${d.fileName}` : `${d.fileName} (no preview)`}
              >
                {isImage(d) ? (
                  <Image src={fileUrl(d)} alt={d.fileName} fill unoptimized sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" />
                ) : (
                  <FileIcon label={isPdf(d) ? "PDF" : (d.fileName.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase()} pdf={isPdf(d)} />
                )}
                {canPreview && (
                  <span className="absolute bottom-2 right-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs text-white">Preview</span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{d.type}</span>
                  <span className="truncate text-xs text-slate-500">{d.scope}</span>
                </div>
                <p className="truncate font-medium" title={d.fileName}>
                  {d.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  {d.uploadedBy} · {d.uploadedAt}
                </p>
                <a
                  href={downloadUrl(d)}
                  download={d.fileName}
                  className="mt-auto inline-flex w-fit items-center gap-1 pt-1 text-xs font-medium text-sky-700 hover:underline"
                >
                  <DownloadIcon /> Download
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {preview && (
        <Modal
          size="xl"
          onClose={() => setPreview(null)}
          title={
            <span className="flex flex-wrap items-center gap-3">
              {preview.fileName}
              <a href={downloadUrl(preview)} download={preview.fileName} className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline">
                <DownloadIcon /> Download
              </a>
            </span>
          }
        >
          {isPdf(preview) ? (
            <iframe src={fileUrl(preview)} title={preview.fileName} className="h-[75vh] w-full rounded border border-slate-200" />
          ) : (
            <div className="relative h-[75vh] w-full">
              <Image src={fileUrl(preview)} alt={preview.fileName} fill unoptimized sizes="90vw" className="object-contain" />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function FileIcon({ label, pdf }: { label: string; pdf: boolean }) {
  return (
    <span className="relative flex h-20 w-16 items-end justify-center rounded-md border-2 border-slate-300 bg-white pb-2 shadow-sm" aria-hidden>
      <span className="absolute right-0 top-0 h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-slate-300 bg-slate-100" />
      <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${pdf ? "bg-red-600" : "bg-slate-500"}`}>{label}</span>
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}
