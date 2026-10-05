"use client";

import { useEffect, useRef } from "react";

// Native <dialog>: focus trap, Esc to close and a backdrop for free.
export function Modal({
  title,
  onClose,
  size = "md",
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  size?: "md" | "xl";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop
      className={`m-auto w-[calc(100%-2rem)] rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/50 ${size === "xl" ? "max-w-5xl" : "max-w-lg"}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="-mr-1 rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
