import { NextResponse } from "next/server";
import { clearOwnerSession } from "@/lib/session";

export async function GET(request: Request) {
  await clearOwnerSession();
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL("/", appUrl));
}
