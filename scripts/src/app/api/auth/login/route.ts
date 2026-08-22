import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { setOwnerSession } from "@/lib/session";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;

  // ---------------------------------------------------------------------
  // Development fallback. Google credentials take a trip to the Cloud
  // console to obtain, and waiting for that would block everything else,
  // so without them the app signs you in as a local account instead.
  // It refuses to do this in production.
  // ---------------------------------------------------------------------
  if (!clientId) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
        { status: 500 }
      );
    }
    const owner = await one<{ id: string }>(
      `INSERT INTO owners (google_sub, email, name)
       VALUES ('dev-local', 'dev@localhost', 'Local Developer')
       ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    if (owner) await setOwnerSession(owner.id);
    return NextResponse.redirect(new URL("/trips", appUrl));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
