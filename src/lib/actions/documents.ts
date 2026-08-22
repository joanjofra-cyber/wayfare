"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, query } from "@/lib/db";
import { canEdit } from "@/lib/session";
import type { Project } from "@/lib/types";

async function loadProject(id: string): Promise<Project> {
  const project = await one<Project>("SELECT * FROM projects WHERE id = $1", [id]);
  if (!project) redirect("/trips");
  return project;
}

/**
 * Hosting platforms cap the size of a request body — on Vercel it is 4.5 MB,
 * and no configuration raises it. Anything larger has to be refused clearly
 * rather than allowed to fail somewhere in the plumbing.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function uploadDocument(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) redirect(`/trips/${projectId}/documents?upload=denied`);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    // A silent `return` here was the original sin: the page reloaded, nothing
    // appeared, and there was no way to tell whether the file was empty, too
    // large, or the save had failed.
    redirect(`/trips/${projectId}/documents?upload=nofile`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`/trips/${projectId}/documents?upload=toolarge`);
  }

  let failure: string | null = null;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await query(
      `INSERT INTO documents (project_id, filename, mime_type, size_bytes, content, source)
       VALUES ($1,$2,$3,$4,$5,'upload')`,
      [projectId, file.name, file.type || "application/octet-stream", buffer.length, buffer]
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  revalidatePath(`/trips/${projectId}/documents`);
  if (failure) {
    redirect(`/trips/${projectId}/documents?upload=error&why=${encodeURIComponent(failure.slice(0, 200))}`);
  }
  redirect(`/trips/${projectId}/documents?upload=ok`);
}

export async function attachDocument(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const documentId = String(formData.get("document_id"));
  const itemId = String(formData.get("item_id") ?? "");
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  await query("UPDATE documents SET item_id = $3 WHERE id = $1 AND project_id = $2", [
    documentId,
    projectId,
    itemId || null,
  ]);

  revalidatePath(`/trips/${projectId}/documents`);
  redirect(`/trips/${projectId}/documents`);
}

export async function deleteDocument(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const documentId = String(formData.get("document_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  await query("DELETE FROM documents WHERE id = $1 AND project_id = $2", [documentId, projectId]);
  revalidatePath(`/trips/${projectId}/documents`);
  redirect(`/trips/${projectId}/documents`);
}

/**
 * Reads the shared Gmail inbox and files anything addressed to this trip.
 *
 * A button rather than a scheduled job, for two reasons. The free Vercel tier
 * only runs cron once a day, which is useless here. And in a demo, a button
 * the presenter presses shows cause and effect far better than something that
 * might or might not have happened in the background.
 */
export async function checkMail(formData: FormData) {
  const projectId = String(formData.get("project_id"));
  const project = await loadProject(projectId);
  if (!(await canEdit(project))) return;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    redirect(`/trips/${projectId}/documents?mail=unconfigured`);
  }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: user!, pass: pass! },
    logger: false,
  });

  let saved = 0;
  let failure: string | null = null;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Every trip shares one mailbox through plus-addressing, so the To:
      // header is what says which trip a message belongs to.
      const marker = `+${project.inbox_token}@`;

      // Look at everything from the last fortnight rather than only unread
      // mail. Keying off the unread flag meant that anyone glancing at the
      // mailbox in Gmail marked the message read and it was never ingested —
      // and the failure was invisible, because the app simply reported that
      // there was nothing new. The ingested_emails table is what prevents
      // duplicates; the read flag was never the right tool for that job.
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const messages = client.fetch({ since }, { uid: true, envelope: true, source: true });

      for await (const message of messages) {
        const parsed = await simpleParser(message.source as Buffer);
        const recipients = [parsed.to, parsed.cc]
          .flatMap((addr) => (addr ? (Array.isArray(addr) ? addr : [addr]) : []))
          .flatMap((addr) => addr.value.map((v) => v.address ?? ""))
          .join(",");

        if (!recipients.includes(marker)) continue;

        const messageId = parsed.messageId ?? `uid-${message.uid}`;
        const already = await one("SELECT message_id FROM ingested_emails WHERE message_id = $1", [
          messageId,
        ]);
        if (already) continue;

        const from = parsed.from?.value?.[0]?.address ?? null;
        const subject = parsed.subject ?? "(no subject)";

        const attachments = parsed.attachments ?? [];
        if (attachments.length === 0) {
          // No attachment: keep the message body itself, which is often the
          // whole booking confirmation.
          // mailparser types `html` as `string | false`.
          const html = typeof parsed.html === "string" ? parsed.html : "";
          const body = Buffer.from(parsed.text ?? html, "utf8");
          await query(
            `INSERT INTO documents (project_id, filename, mime_type, size_bytes, content, source, from_email, subject)
             VALUES ($1,$2,'text/plain',$3,$4,'email',$5,$6)`,
            [projectId, `${subject}.txt`, body.length, body, from, subject]
          );
          saved++;
        } else {
          for (const attachment of attachments) {
            await query(
              `INSERT INTO documents (project_id, filename, mime_type, size_bytes, content, source, from_email, subject)
               VALUES ($1,$2,$3,$4,$5,'email',$6,$7)`,
              [
                projectId,
                attachment.filename ?? "attachment",
                attachment.contentType ?? "application/octet-stream",
                attachment.size ?? attachment.content.length,
                attachment.content,
                from,
                subject,
              ]
            );
            saved++;
          }
        }

        await query(
          "INSERT INTO ingested_emails (message_id, project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [messageId, projectId]
        );
        await client.messageFlagsAdd({ uid: String(message.uid) }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    // Say what actually went wrong. "Couldn't reach the mailbox" sends people
    // hunting through the wrong settings; "Invalid credentials" does not.
    failure = error instanceof Error ? error.message : String(error);
  }

  revalidatePath(`/trips/${projectId}/documents`);
  if (failure) {
    redirect(`/trips/${projectId}/documents?mail=error&why=${encodeURIComponent(failure.slice(0, 200))}`);
  }
  redirect(`/trips/${projectId}/documents?mail=${saved}`);
}
