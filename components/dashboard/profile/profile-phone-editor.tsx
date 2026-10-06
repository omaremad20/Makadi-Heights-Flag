"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMyPhoneAction } from "@/lib/services/profile/profile.actions";

type ProfilePhoneEditorProps = {
  phone: string | null;
};

export function ProfilePhoneEditor({ phone }: ProfilePhoneEditorProps) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setValue(phone ?? "");
    setEditing(false);
  }

  function handleSave() {
    const phone = value.trim();

    if (phone && !/^01[0125]\d{8}$/.test(phone)) {
      toast.error("Please enter a valid Egyptian mobile number.");
      return;
    }

    startTransition(async () => {
      try {
        await updateMyPhoneAction(phone);

        setEditing(false);
        router.refresh();

        toast.success("Phone number updated successfully.");
      } catch {
        toast.error("Could not update your phone number.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span>
          {phone || (
            <span className="font-normal text-muted-foreground">
              Not provided
            </span>
          )}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setEditing(true)}
          aria-label="Edit phone number"
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        type="tel"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Enter your phone number"
        maxLength={11}
        disabled={pending}
        autoFocus
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="icon"
          onClick={handleSave}
          disabled={pending}
          aria-label="Save phone number"
        >
          <Check />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleCancel}
          disabled={pending}
          aria-label="Cancel"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
