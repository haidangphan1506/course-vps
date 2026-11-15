"use client";

import { useState } from "react";

export default function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`cursor-pointer rounded-md bg-[#1e2a33] px-2 py-0.5 text-[11px] text-[#b9c7d1] opacity-85 hover:opacity-100 ${className}`}
    >
      {copied ? "Đã chép" : "Chép"}
    </button>
  );
}
