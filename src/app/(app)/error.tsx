"use client";

import { buttonClass } from "@/components/ui";

// Shown when a page fails to load. Nothing is saved by retrying.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <h1 className="text-base font-semibold text-red-900">This page could not be loaded.</h1>
      <p className="mt-1 text-sm text-red-800">{error.message || "Something went wrong."}</p>
      <button type="button" onClick={reset} className={`${buttonClass} mt-3`}>
        Try again
      </button>
    </div>
  );
}
