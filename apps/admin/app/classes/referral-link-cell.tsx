"use client";

import { useState } from "react";

/** Клікабельне посилання-запрошення учня + кнопка копіювання — щоб одразу скидати в месенджер. */
export function ReferralLinkCell({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={url}
        className="max-w-[190px] truncate font-mono text-[11px] text-purple hover:underline"
      >
        {url}
      </a>
      <button
        onClick={copy}
        aria-label="Копіювати посилання"
        className="flex-shrink-0 rounded-[6px] border border-line bg-page px-1.5 py-1 text-[10.5px] font-bold text-purple hover:border-purple"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}
