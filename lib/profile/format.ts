const APP_LOCALE = "en-GB";
const APP_TIME_ZONE = "Africa/Cairo";

const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "long",
  timeZone: APP_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: APP_TIME_ZONE,
});

function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string | null {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : null;
}

export function formatDateTime(
  value: string | null | undefined,
): string | null {
  const date = toValidDate(value);
  return date ? dateTimeFormatter.format(date) : null;
}

export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  employee: "Employee",
  customer: "Customer",
};

export function roleLabel(role: string): string {
  return (
    ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1)
  );
}

export function getInitials(
  fullName: string | null,
  email: string,
): string {
  const name = fullName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }
  return email.charAt(0).toUpperCase();
}