import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { getProject } from "@/lib/queries";
import { canView } from "@/lib/session";

interface DocRow {
  project_id: string;
  filename: string;
  mime_type: string | null;
  content: Buffer;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const doc = await one<DocRow>(
    "SELECT project_id, filename, mime_type, content FROM documents WHERE id = $1",
    [docId]
  );
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const project = await getProject(doc.project_id);
  if (!project || !(await canView(project))) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mime_type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
    },
  });
}
