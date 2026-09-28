"use client";

import { useTransition } from "react";
import { setCurrentUser } from "@/app/actions";

export function UserPicker({
  users,
  currentUserId,
}: {
  users: { id: number; label: string }[];
  currentUserId: number | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>Signed in as</span>
      <select
        className={`rounded-md border px-2 py-1 text-slate-900 ${currentUserId ? "border-slate-300" : "border-amber-400 bg-amber-50"}`}
        value={currentUserId ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(() => setCurrentUser(Number(e.target.value)))}
      >
        <option value="" disabled>
          Pick a user…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
    </label>
  );
}
