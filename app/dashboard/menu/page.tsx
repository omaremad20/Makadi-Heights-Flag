import { redirect } from "next/navigation";

import { MenuUploader } from "@/components/dashboard/menu/menu-uploader";
import { getAdminContext } from "@/lib/auth/require-admin";
import { formatDateTime } from "@/lib/applications/labels";
import { getCurrentMenu } from "@/lib/services/settings/menu.service";

export const metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

/**
 * Replaces the hotel management pages. Dining times, prices and aquapark
 * details are static config now (code change + redeploy); only the menu PDF
 * is managed here.
 */
export default async function MenuPage() {
  if (!(await getAdminContext())) redirect("/dashboard/sea");
  const menu = await getCurrentMenu();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
        <p className="text-sm text-muted-foreground">
          The restaurant menu shown on the homepage. Current file: <span className="font-medium">{menu.path}</span>
          {menu.updatedAt ? ` · updated ${formatDateTime(menu.updatedAt)}` : ""}
        </p>
      </header>
      <MenuUploader menuLink={menu.url} />
      <p className="text-xs text-muted-foreground">
        Previous menu files are kept in storage so old links keep working. Dining hours, prices and aquapark details are
        changed in the code (lib/config/hotel.ts).
      </p>
    </div>
  );
}
