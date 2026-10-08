// Database queries for work queues and the Lots list. Filtering, counting and
// pagination run in the database against the workflow cache (Lot.wf*); only the
// page being shown is loaded in full and run through the shared selector.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { LOT_INCLUDE, lotLabel } from "./records";
import { QUEUES, lotWorkflow, queueTask, workflowInputFromLot, type CurrentTask, type QueueKey, type Workflow } from "./workflow";

type User = { qcAuthorized: boolean };
export type ListFilters = { q?: string; categoryId?: number };

export const QUEUE_KEYS = Object.keys(QUEUES) as QueueKey[];

export const QUEUE_WHERE: Record<QueueKey, Prisma.LotWhereInput> = {
  inspection: { wfInspection: true },
  release: { wfRelease: true },
  followup: { wfFollowup: true },
};

// The part of each queue the user can act on now (the rest waits on someone else).
// Mirrors the canDo rules in workflow.ts: QC can do everything; others can enter
// inspection results (not confirm a draft), fix non-QC tasks, and not release/reject.
export function actionableWhere(queue: QueueKey, user: User): Prisma.LotWhereInput {
  if (user.qcAuthorized) return {};
  if (queue === "inspection") return { wfInspectionDraft: false };
  if (queue === "release") return { wfReleaseBlocked: true, wfFollowupQcOnly: false, wfOpenTasks: { gt: 0 } };
  return { wfFollowupQcOnly: false };
}

export function searchWhere(f: ListFilters): Prisma.LotWhereInput {
  const and: Prisma.LotWhereInput[] = [];
  if (f.categoryId) and.push({ item: { categoryId: f.categoryId } });
  const q = f.q?.trim();
  if (q)
    and.push({
      OR: [
        { supplierBatchNo: { contains: q } },
        { lotNo: { contains: q } },
        { item: { code: { contains: q } } },
        { item: { name: { contains: q } } },
        { receipt: { receivingNo: { contains: q } } },
      ],
    });
  return and.length ? { AND: and } : {};
}

// Oldest received first; created time then id keep the order stable (no due dates or priorities exist).
export const OLDEST_FIRST: Prisma.LotOrderByWithRelationInput[] = [{ receipt: { dateReceived: "asc" } }, { createdAt: "asc" }, { id: "asc" }];
export const NEWEST_FIRST: Prisma.LotOrderByWithRelationInput[] = [{ receipt: { dateReceived: "desc" } }, { createdAt: "desc" }, { id: "desc" }];

export async function queueCounts(user: User, f: ListFilters) {
  const base = searchWhere(f);
  const entries = await Promise.all(
    QUEUE_KEYS.map(async (k) => {
      const where = { AND: [base, QUEUE_WHERE[k]] };
      const [total, mine] = await Promise.all([
        prisma.lot.count({ where }),
        prisma.lot.count({ where: { AND: [where, actionableWhere(k, user)] } }),
      ]);
      return [k, { total, mine }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<QueueKey, { total: number; mine: number }>;
}

export type QueueEntry = {
  lotId: number;
  lotLabel: string;
  itemName: string;
  itemCode: string;
  dateReceived: Date;
  task: CurrentTask;
};

// Up to `take` entries of one queue, oldest first; only these lots are loaded.
// `mine`: only entries this user can act on now (see actionableWhere).
export async function queueEntries(queue: QueueKey, user: User, f: ListFilters, take = 10, mine = false): Promise<QueueEntry[]> {
  const lots = await prisma.lot.findMany({
    where: { AND: [searchWhere(f), QUEUE_WHERE[queue], mine ? actionableWhere(queue, user) : {}] },
    include: LOT_INCLUDE,
    orderBy: OLDEST_FIRST,
    take,
  });
  return lots.map((lot) => {
    const input = workflowInputFromLot(lot);
    const wf = lotWorkflow(input, user);
    return {
      lotId: lot.id,
      lotLabel: lotLabel(lot),
      itemName: lot.item.name,
      itemCode: lot.item.code,
      dateReceived: lot.receipt.dateReceived,
      task: queueTask(queue, wf, input, user),
    };
  });
}

// ---- Lots list -------------------------------------------------------------------------------

export const LOT_VIEWS = {
  inspect: { label: "Awaiting inspection", where: QUEUE_WHERE.inspection },
  release: { label: "Release review", where: QUEUE_WHERE.release },
  ready: { label: "Ready for release review", where: { wfRelease: true, wfReleaseBlocked: false, wfStage: "release" } },
  followup: { label: "Receiving & documents", where: QUEUE_WHERE.followup },
  usage: { label: "Released with stock", where: { qcStatus: "Released", wfBalance: { gt: 0 } } },
  failed: { label: "Inspection failed", where: { wfStage: "failed" } },
} satisfies Record<string, { label: string; where: Prisma.LotWhereInput }>;
export type LotView = keyof typeof LOT_VIEWS;

export type LotRow = { lot: Prisma.LotGetPayload<{ include: typeof LOT_INCLUDE }>; wf: Workflow };

export async function lotPage(opts: {
  user: User;
  filters: ListFilters;
  view?: LotView;
  status?: string;
  sort: "oldest" | "newest";
  page: number;
  pageSize: number;
}) {
  const where: Prisma.LotWhereInput = {
    AND: [searchWhere(opts.filters), opts.view ? LOT_VIEWS[opts.view].where : {}, opts.status ? { qcStatus: opts.status } : {}],
  };
  const [total, lots] = await Promise.all([
    prisma.lot.count({ where }),
    prisma.lot.findMany({
      where,
      include: LOT_INCLUDE,
      orderBy: opts.sort === "newest" ? NEWEST_FIRST : OLDEST_FIRST,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
  ]);
  const rows: LotRow[] = lots.map((lot) => ({ lot, wf: lotWorkflow(workflowInputFromLot(lot), opts.user) }));
  return { total, rows };
}
