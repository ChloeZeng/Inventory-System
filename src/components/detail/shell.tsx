"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { Modal } from "@/components/modal";

// Layout kit for record detail pages (lots now; items and suppliers can follow):
//   <DetailShell>            context + modal host
//     <DetailHeader/>        sticky identity line
//     …top area…             what's next, open requirements (always visible)
//     <DetailTabs/>          one tab visible at a time
//
// The tab lives in the URL (?tab=…, via history.replaceState: no server round-trip).
// Links can also open the page straight into a modal (?fix=<requirement>, ?do=<action>):
// those are read once on load and then removed from the URL, and from then on the
// open modal is plain React state. (Keeping it in the URL would let the refresh after
// a save restore the stale ?fix= and reopen the modal.)

// doneMessage: flashed when the modal's job is done — its key disappears from
// `modals` after the save (e.g. the requirement it fixed is no longer open).
export type ShellModal = { title: string; body: React.ReactNode; size?: "md" | "xl"; doneMessage?: string };

type ShellContext = {
  tab: string;
  selectTab: (tab: string) => void;
  openFix: (key: string) => void;
  openAction: (name: string) => void;
  close: (flash?: string) => void;
  flash: string | null;
};

const Ctx = createContext<ShellContext | null>(null);

export function useDetailShell() {
  return useContext(Ctx);
}

function setParams(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export function DetailShell({
  defaultTab,
  modals,
  children,
}: {
  defaultTab: string;
  // "fix:<requirement key>" → one-field form; "do:<name>" → an action such as release
  modals: Record<string, ShellModal>;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const [flash, setFlash] = useState<string | null>(null);
  // the open modal, with the message to show once its job is done
  const [open, setOpen] = useState<{ key: string; doneMessage?: string } | null>(() => {
    const fix = params.get("fix");
    const action = params.get("do");
    const key = fix ? `fix:${fix}` : action ? `do:${action}` : null;
    return key && modals[key] ? { key, doneMessage: modals[key].doneMessage } : null; // a deep link to something already done opens nothing
  });
  // A successful save refreshes the page data in the same render that delivers the
  // result, so the modal's own form may unmount before it can report success.
  // When the open modal's key is gone from `modals`, its job is done: close it here.
  if (open && !modals[open.key]) {
    setOpen(null);
    setFlash(open.doneMessage ?? "Saved.");
  }
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    // Deep link consumed: drop ?fix= / ?do= so later refreshes cannot bring them back.
    // Deferred one tick: child effects run before the router has hooked history.
    const t = window.setTimeout(() => {
      if (/[?&](fix|do)=/.test(window.location.search)) setParams({ fix: null, do: null });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const tab = params.get("tab") ?? defaultTab;
  const modalKey = open?.key ?? null;
  const modal = modalKey ? modals[modalKey] : undefined;
  const openKey = (key: string) => setOpen(modals[key] ? { key, doneMessage: modals[key].doneMessage } : null);

  const ctx: ShellContext = {
    tab,
    flash,
    selectTab: (t) => setParams({ tab: t === defaultTab ? null : t }),
    openFix: (key) => openKey(`fix:${key}`),
    openAction: (name) => openKey(`do:${name}`),
    close: (message) => {
      setOpen(null);
      if (message) setFlash(message);
    },
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {modal && (
        <Modal key={modalKey} title={modal.title} size={modal.size} onClose={() => ctx.close()}>
          {modal.body}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

// Forms inside a shell modal call this: on success the modal closes and the
// message flashes in the top area while the page data refreshes in place.
export function useCloseOnSuccess(state: ActionState) {
  const shell = useDetailShell();
  useEffect(() => {
    if (state.ok) shell?.close(state.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per new result
  }, [state]);
}

export function DetailTabs({ tabs }: { tabs: { key: string; label: string; count?: number; content: React.ReactNode }[] }) {
  const shell = useDetailShell();
  const active = tabs.some((t) => t.key === shell?.tab) ? shell!.tab : tabs[0].key;
  return (
    <div>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={t.key === active}
            aria-controls={`panel-${t.key}`}
            onClick={() => shell?.selectTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
              t.key === active ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${t.key === active ? "bg-sky-100" : "bg-slate-100"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {/* every panel stays mounted (half-typed forms survive a tab switch); only one is shown */}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={t.key !== active} className="pt-5">
          {t.content}
        </div>
      ))}
    </div>
  );
}

// Sticky identity line: what this record is, and its status, while you scroll the tabs.
export function DetailHeader({
  back,
  title,
  badges,
  meta,
  aside,
}: {
  back?: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:top-0 md:-mx-8 md:px-8">
      {back && <div className="mb-0.5 text-sm">{back}</div>}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-semibold tracking-tight">
            {title}
            {badges}
          </h1>
          {meta && <div className="mt-0.5 text-sm text-slate-600">{meta}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function FlashMessage() {
  const shell = useDetailShell();
  if (!shell?.flash) return null;
  return (
    <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      ✓ {shell.flash}
    </p>
  );
}
