import { NextResponse } from "next/server";
import { getProjectByShareToken } from "@/lib/queries";
import { grantGuestAccess, guestIdentity } from "@/lib/session";

/**
 * The share link. This is a route handler rather than a page because opening
 * it has a side effect — it grants this browser access to the trip — and
 * cookies can only be written from a route handler or a server action.
 *
 * The whole point is that this is instant: no sign-in, no account, no app.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const project = await getProjectByShareToken(token);

  if (!project) {
    return NextResponse.redirect(new URL(`/t/${token}/expired`, appUrl));
  }

  await grantGuestAccess(project.id);

  // First visit on this device: ask the one question, then never again.
  const who = await guestIdentity(project.id);
  const next = who ? `/t/${token}/view` : `/t/${token}/who`;
  return NextResponse.redirect(new URL(next, appUrl));
}
