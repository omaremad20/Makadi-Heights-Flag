import type { ReactNode } from "react";
import { CircleAlert, UserRoundX } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type ProfileStateMessageProps = {
  variant: "not_found" | "error";
  action?: ReactNode;
};

const CONTENT = {
  not_found: {
    icon: UserRoundX,
    title: "Profile not found",
    description:
      "We couldn't find a profile for your account. Please contact an administrator if this keeps happening.",
  },
  error: {
    icon: CircleAlert,
    title: "Something went wrong",
    description:
      "We couldn't load your profile right now. Please refresh the page or try again in a moment.",
  },
} as const;

export function ProfileStateMessage({
  variant,
  action,
}: ProfileStateMessageProps) {
  const { icon: Icon, title, description } = CONTENT[variant];

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}