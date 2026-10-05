import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { chooseUser, skipTour } from "../actions";

// First visit: welcome → "Who are you?" → what you can do → Home (with the tour).
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step = "intro" } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center">
          <Image src="/logo.svg" alt="SVLSG" width={176} height={40} unoptimized priority className="h-12 w-auto" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          {step === "who" ? <WhoAreYou /> : step === "ready" ? <Ready /> : <Intro />}
        </div>
        <StepDots step={step} />
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to SVLSG Inventory</h1>
      <p className="mt-3 text-slate-600">
        It guides every delivery from receiving through quarantine, QC inspection and release, so each lot is complete and
        audit-ready.
      </p>
      <Link href="/welcome?step=who" className={`${buttonClass} mt-8 px-6 py-2.5 text-base`}>
        Get started
      </Link>
    </div>
  );
}

async function WhoAreYou() {
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Who are you?</h1>
      <p className="mt-1 text-sm text-slate-600">Your name goes on everything you record.</p>
      <ul className="mt-6 space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <form action={chooseUser}>
              <input type="hidden" name="userId" value={u.id} />
              <button className="flex w-full items-center gap-4 rounded-lg border-2 border-slate-200 p-4 text-left hover:border-sky-500 hover:bg-sky-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                  {u.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{u.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                    {u.qcAuthorized ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">QC authorized</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Not QC authorized</span>
                    )}
                    {u.role === "admin" && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800">Admin</span>}
                  </span>
                </span>
                <span className="text-sky-700" aria-hidden>
                  →
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}

async function Ready() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hi {user.name.split(" ")[0]} — here’s what you can do</h1>
      <ul className="mt-5 space-y-3 text-sm">
        <li className="flex gap-3">
          <Check ok />
          <span>Receive deliveries, record usage, and open the Inspect and Release screens for any lot.</span>
        </li>
        {user.qcAuthorized ? (
          <li className="flex gap-3">
            <Check ok />
            <span>
              <strong>You are QC authorized.</strong> You can set inspection dispositions and release or reject lots.
            </span>
          </li>
        ) : (
          <li className="flex gap-3">
            <Check ok={false} />
            <span>
              <strong>You are not QC authorized.</strong> Setting an inspection disposition and releasing or rejecting a lot need a
              QC-authorized colleague — those buttons show “Requires QC authorization”.
            </span>
          </li>
        )}
        {user.role === "admin" && (
          <li className="flex gap-3">
            <Check ok />
            <span>As an admin you can also manage users and who is QC authorized.</span>
          </li>
        )}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/?tour=1" className={buttonClass}>
          Take the 3-step tour
        </Link>
        <form action={skipTour}>
          <button className={secondaryButtonClass}>Skip the tour</button>
        </form>
        <Link href="/welcome?step=who" className="self-center text-sm text-sky-700 hover:underline">
          Not you?
        </Link>
      </div>
    </>
  );
}

function Check({ ok }: { ok: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
      aria-hidden
    >
      {ok ? "✓" : "!"}
    </span>
  );
}

function StepDots({ step }: { step: string }) {
  const steps = ["intro", "who", "ready"];
  const current = Math.max(0, steps.indexOf(step));
  return (
    <ol className="mt-6 flex justify-center gap-2" aria-label={`Step ${current + 1} of 3`}>
      {steps.map((s, i) => (
        <li key={s} className={`h-2 w-2 rounded-full ${i === current ? "bg-sky-600" : "bg-slate-300"}`} />
      ))}
    </ol>
  );
}
