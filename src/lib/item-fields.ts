// Item fields beyond the description: owner, dedicated product and usual supplier.
// Shared by the item form and the receiving wizard's "new item" step.

import { SVLSG_OWNER } from "./constants";

export type ItemExtras = { owner: string; dedicatedProduct: string | null; supplierId: number | null };

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ownerKind: "svlsg" | "client"; ownerClient: the client's name.
// supplierId is optional; when `supplierIds` is given it must be one of them.
export function readItemExtras(fd: FormData, supplierIds?: number[]) {
  const fieldErrors: Record<string, string> = {};
  const kind = text(fd, "ownerKind") ?? "svlsg";
  const client = text(fd, "ownerClient");
  let owner = SVLSG_OWNER;
  if (kind === "client") {
    if (!client) fieldErrors.ownerClient = "Enter the client's name.";
    else if (client.toUpperCase() === SVLSG_OWNER) fieldErrors.ownerClient = "Choose “SVLSG” above for SVLSG-owned stock.";
    else owner = client;
  }
  const supplierId = Number(fd.get("itemSupplierId")) || null;
  if (supplierId && supplierIds && !supplierIds.includes(supplierId)) fieldErrors.itemSupplierId = "Pick a supplier from the list.";
  const values: ItemExtras = { owner, dedicatedProduct: text(fd, "dedicatedProduct"), supplierId };
  return { values, fieldErrors };
}

export function isClientOwned(owner: string) {
  return owner.trim().toUpperCase() !== SVLSG_OWNER;
}

// Is `product` someone else's than the item's dedicated product? (case and spacing ignored)
export function differsFromDedicated(dedicatedProduct: string | null | undefined, product: string | null | undefined) {
  if (!dedicatedProduct?.trim() || !product?.trim()) return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(dedicatedProduct) !== norm(product);
}
