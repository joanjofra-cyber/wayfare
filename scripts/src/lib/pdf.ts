/**
 * Pull the text out of a stored document so the extractor has something to read.
 *
 * PDFs are handled with pdf.js, which is pure JavaScript and works in a
 * serverless function. A scanned PDF — a photo of a ticket rather than a
 * generated one — has no text layer and will come back empty. That is not a
 * failure to hide: the review screen says it could not read the document and
 * the organiser fills the form in by hand, which is exactly the honest outcome.
 */
export async function documentText(content: Buffer, mimeType: string | null): Promise<string> {
  const type = mimeType ?? "";

  if (type.includes("pdf")) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = pdfjs.getDocument({ data: new Uint8Array(content), useSystemFonts: false });
      const doc = await task.promise;

      const pages: string[] = [];
      const limit = Math.min(doc.numPages, 8); // confirmations are short
      for (let i = 1; i <= limit; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        pages.push(
          textContent.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
        );
      }
      await task.destroy();
      return pages.join("\n");
    } catch {
      return "";
    }
  }

  if (type.startsWith("text/") || type.includes("html") || type.includes("json")) {
    const text = content.toString("utf8");
    // Strip tags so an HTML confirmation reads as prose.
    return type.includes("html")
      ? text.replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
      : text;
  }

  return "";
}
