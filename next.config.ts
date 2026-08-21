import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Booking PDFs and images forwarded by email can be a few MB.
    serverActions: { bodySizeLimit: "8mb" },
  },
  // pdf.js and the IMAP client must be required at runtime rather than bundled.
  // Bundling pdf.js silently breaks its text extraction — it returns nothing at
  // all, which looks exactly like a scanned document and is very hard to spot.
  serverExternalPackages: ["pdfjs-dist", "imapflow", "mailparser"],
};

export default nextConfig;
