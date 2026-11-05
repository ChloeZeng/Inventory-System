"use client";

import { useEffect } from "react";

// The count was submitted: forget what was typed in this browser.
export function ClearDraft({ draftKey }: { draftKey: string }) {
  useEffect(() => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // nothing stored
    }
  }, [draftKey]);
  return null;
}
