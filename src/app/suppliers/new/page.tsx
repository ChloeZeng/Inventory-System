import { getCurrentUser } from "@/lib/current-user";
import { Card, PageHeader } from "@/components/ui";
import { SupplierForm } from "../supplier-form";
import { createSupplier } from "../actions";

export default async function NewSupplierPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader title="New supplier" back={{ href: "/suppliers", label: "Suppliers" }} />
      <Card className="max-w-2xl">
        {user ? (
          <SupplierForm action={createSupplier} canApprove={user.role === "qc" || user.role === "admin"} />
        ) : (
          <p className="text-sm text-amber-700">Pick a user in the top bar before creating suppliers.</p>
        )}
      </Card>
    </>
  );
}
