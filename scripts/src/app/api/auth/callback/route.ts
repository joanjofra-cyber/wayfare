import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { setOwnerSession } from "@/lib/session";

interface GoogleClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

/** Read the id_token payload. Safe without verification: it came straight from
 *  Google's token endpoint over TLS, not from the browser. */
function readIdToken(idToken: string): GoogleClaims | null {
  try {
    const [, payload] = idToken.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as GoogleClaims;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL ?? url.origin;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error ?? "no_code")}`, appUrl));
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appUrl}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/?error=token_exchange", appUrl));
  }

  const tokens = (await res.json()) as { id_token?: string };
  const claims = tokens.id_token ? readIdToken(tokens.id_token) : null;
  if (!claims?.sub) {
    return NextResponse.redirect(new URL("/?error=no_claims", appUrl));
  }

  // Look up by `sub`, never by email: people change their email address and
  // Google's subject identifier is the thing that never moves.
  const owner = await one<{ id: string }>(
    `INSERT INTO owners (google_sub, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
     RETURNING id`,
    [claims.sub, claims.email ?? "", claims.name ?? claims.email ?? "Traveller", claims.picture ?? null]
  );

  if (!owner) return NextResponse.redirect(new URL("/?error=no_owner", appUrl));

  await setOwnerSession(owner.id);
  return NextResponse.redirect(new URL("/trips", appUrl));
}
