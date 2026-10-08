"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishTour } from "@/app/actions";

// 3-step guided tour on the real Home page. Each step highlights the element
// marked data-tour="…" and shows a small tooltip with Next / Skip.
const STEPS = [
  { target: "queues", title: "Work queues", text: "Inspection, release review, and receiving & document follow-up — with how many you can act on." },
  { target: "worklist", title: "Next tasks", text: "The oldest lots first. Each button does the next step for that lot." },
  { target: "actions", title: "Start something new", text: "Receive a delivery, or record usage from a released lot." },
] as const;

type Box = { top: number; left: number; width: number; height: number };
const PAD = 8;

export function HomeTour({ start }: { start: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(start);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
    if (!el) return;
    // a tall area (e.g. a long to-do list) scrolls to its top so its heading stays in view
    el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.7 ? "start" : "center", behavior: "smooth" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    // measure after layout and while the smooth scroll settles
    const raf = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  async function end() {
    setOpen(false);
    await finishTour(); // remember it for this user
    router.replace("/"); // drop ?tour=1
  }

  if (!open || !box) return null;
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  // Tooltip below the highlight if it fits, else above; if the highlighted area fills
  // the screen, pin the tooltip to the bottom of the viewport so it is always visible.
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const TIP_ROOM = 190;
  const tipPos: React.CSSProperties =
    viewportH - (box.top + box.height) >= TIP_ROOM
      ? { top: box.top + box.height + 12 }
      : box.top >= TIP_ROOM
        ? { bottom: viewportH - box.top + 12 }
        : { bottom: 16 };
  const tipWidth = Math.min(340, viewportW - 32);
  const tipLeft = Math.max(16, Math.min(box.left, viewportW - tipWidth - 16));

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" onKeyDown={(e) => e.key === "Escape" && end()}>
      {/* click shield + dimmed backdrop with a cut-out around the highlighted area */}
      <div className="absolute inset-0" />
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-sky-400 transition-all duration-200"
        style={{ ...box, boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)" }}
      />
      <div
        className="absolute rounded-lg bg-white p-4 shadow-xl"
        style={{ left: tipLeft, width: tipWidth, ...tipPos }}
      >
        <p className="text-xs font-medium text-slate-500">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-0.5 font-semibold">
          {s.title}
        </h2>
        <p className="mt-1 text-sm text-slate-700">{s.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={end} className="text-sm text-slate-500 hover:text-slate-800">
            Skip
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? end() : setStep(step + 1))}
            className="rounded-md bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
