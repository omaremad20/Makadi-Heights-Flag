import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");

  const next =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectUrl = new URL(next, origin);

      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
