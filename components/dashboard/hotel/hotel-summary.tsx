import Link from "next/link";
import { ExternalLink, FileText, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hotel } from "@/lib/services/hotel/admin/schema";

const CURRENCY = "EGP"; // change here if needed
const money = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} ${CURRENCY}`;
const fmtDate = (iso: string | null) =>
  iso ? `${new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "—";

function AuditItem({ label, at, by }: { label: string; at: string | null; by: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{fmtDate(at)}</dd>
      <dd className="break-all text-muted-foreground">By: {by ?? "Unknown"}</dd>
    </div>
  );
}

export function HotelSummary({ hotel, modifyHref }: { hotel: Hotel; modifyHref: string }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">1. {hotel.name || "Hotel"}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {fmtDate(hotel.updated_at)}
            {hotel.last_updated_by_email ? ` by ${hotel.last_updated_by_email}` : ""}
          </p>
        </div>
        <Button asChild>
          <Link href={modifyHref}>
            <Pencil /> Modify
          </Link>
        </Button>
      </header>

      {/* Menu */}
      <Card>
        <CardHeader>
          <CardTitle>Menu</CardTitle>
        </CardHeader>
        <CardContent>
          {hotel.menu_link ? (
            <Button asChild variant="outline">
              <a href={hotel.menu_link} target="_blank" rel="noopener noreferrer">
                <FileText /> View menu PDF <ExternalLink />
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">No menu uploaded.</p>
          )}
        </CardContent>
      </Card>

      {/* Beach access */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Beach access</h2>
        {hotel.beach_access_methods.length === 0 && <p className="text-sm text-muted-foreground">No access methods.</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {hotel.beach_access_methods.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base">{m.title}</CardTitle>
                <CardDescription>{m.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-lg font-semibold">
                  {m.price != null ? money(m.price) : (m.link ? "Membership" : "Free / Included")}
                </p>
                <p className="text-xs text-muted-foreground">{m.per}</p>
                {m.link && (
                  <Button asChild variant="outline" size="sm" className="mt-2 text-xs">
                    <a href={m.link} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-3.5 w-3.5 mr-1" /> View price list PDF <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Aqua park */}
      <Card>
        <CardHeader>
          <CardTitle>Aqua park</CardTitle>
          <CardDescription>Ticket price: {money(hotel.aquapark.price)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {hotel.aquapark.schedule.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {s.label}
                  {s.is_break && <Badge variant="secondary">Break</Badge>}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.start_time} – {s.end_time}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Audit */}
      <Card>
        <CardHeader>
          <CardTitle>Audit</CardTitle>
          <CardDescription>Recorded automatically and can&apos;t be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <AuditItem label="Created" at={hotel.created_at} by={hotel.created_by_email} />
            <AuditItem label="Last updated" at={hotel.updated_at} by={hotel.last_updated_by_email} />
          </dl>
        </CardContent>
      </Card>

      {/* Dining */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Dining</h2>
        {hotel.dining.length === 0 && <p className="text-sm text-muted-foreground">No dining entries.</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {hotel.dining.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="text-base">{d.name}</CardTitle>
                <CardDescription>
                  {d.start_time} – {d.end_time}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-sm">{d.description}</p>
                <p className="text-sm font-medium">{d.price}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}