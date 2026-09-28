import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { parseCategoryConfig, parseSpecs } from "@/lib/category-config";
import { todayDateInput } from "@/lib/forms";
import { Card, PageHeader, formatDate } from "@/components/ui";
import { ReceiveWizard, type WizardData } from "./receive-wizard";

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ receipt?: string }> }) {
  const { receipt: receiptParam } = await searchParams;
  const user = await getCurrentUser();

  if (!user)
    return (
      <>
        <PageHeader title="Receive a delivery" />
        <Card>
          <p className="text-sm text-amber-700">Pick who you are in the top-right corner first — your initials go on the receiving record.</p>
        </Card>
      </>
    );

  const [categories, items, suppliers, locations, receipt] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.item.findMany({
      where: { active: true },
      include: { documents: { select: { type: true } }, _count: { select: { lots: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    receiptParam
      ? prisma.receipt.findUnique({
          where: { id: Number(receiptParam) },
          include: { supplier: true, documents: { select: { type: true } }, _count: { select: { lots: true } } },
        })
      : null,
  ]);

  const data: WizardData = {
    categories: categories.map((c) => {
      const config = parseCategoryConfig(c.config);
      return { id: c.id, name: c.name, codePrefix: c.codePrefix, specFields: config.specFields, requirements: config.requirements };
    }),
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      legacyCode: i.legacyCode,
      categoryId: i.categoryId,
      specs: parseSpecs(i.specs),
      docTypes: i.documents.map((d) => d.type),
      lotCount: i._count.lots,
    })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, type: s.type, aslApproved: s.aslApproved })),
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    today: todayDateInput(),
    receipt: receipt && {
      id: receipt.id,
      receivingNo: receipt.receivingNo,
      supplierName: receipt.supplier.name,
      dateReceived: formatDate(receipt.dateReceived),
      lotCount: receipt._count.lots,
      facts: {
        supplierId: receipt.supplierId,
        dateReceived: receipt.dateReceived.toISOString(),
        carrierInspectionDone: receipt.carrierInspectionDone,
        poInvoiceNo: receipt.poInvoiceNo,
        qtyMatchesPackingList: receipt.qtyMatchesPackingList,
        segregation: receipt.segregation,
        quarantineStickerApplied: receipt.quarantineStickerApplied,
      },
      docTypes: receipt.documents.map((d) => d.type),
    },
  };

  return (
    <>
      <PageHeader
        title={receipt ? `Add another lot to ${receipt.receivingNo}` : "Receive a delivery"}
        subtitle={
          receipt ? (
            <>
              {receipt.supplier.name} · received {formatDate(receipt.dateReceived)} · already {receipt._count.lots} lot
              {receipt._count.lots === 1 ? "" : "s"}. <Link href="/receive" className="text-sky-700 hover:underline">Start a new delivery instead</Link>
            </>
          ) : (
            "Answer one question at a time. Everything lands in Quarantine until QC releases it."
          )
        }
      />
      <ReceiveWizard data={data} />
    </>
  );
}
