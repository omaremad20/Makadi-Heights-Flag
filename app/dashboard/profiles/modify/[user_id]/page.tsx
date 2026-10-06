import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisplayName, isUuid } from "@/lib/profiles/utils";
import { getProfileById } from "@/lib/services/profiles/profiles.service";

type PageProps = { params: Promise<{ user_id: string }> };

export default async function ModifyProfilePage({ params }: PageProps) {
  const { user_id } = await params;
  if (!isUuid(user_id)) notFound();

  const profile = await getProfileById(user_id);
  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-4 ">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={`/dashboard/profiles/${profile.id}`}>
          <ArrowLeft aria-hidden /> Back
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Modify {getDisplayName(profile)}</h1>
      <p className="text-sm text-muted-foreground">The edit form will be built here next.</p>
    </div>
  );
}