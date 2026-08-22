"use client";

import { useState } from "react";

export default function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the text is selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="copyfield">
      <span className="val">{value}</span>
      <button type="button" className="btn btn-sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
