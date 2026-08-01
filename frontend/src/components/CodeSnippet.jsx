import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

export default function CodeSnippet({ code, language = "bash" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, button just won't confirm
    }
  };

  return (
    <div className="relative rounded-xl border border-forge-800 bg-forge-925">
      <div className="flex items-center justify-between border-b border-forge-800 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-forge-500">{language}</span>
        <motion.button
          whileTap={{ scale: 0.94 }}
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-forge-400 transition-colors hover:bg-forge-800 hover:text-forge-100"
        >
          {copied ? (
            <span className="inline-flex items-center gap-1.5">
              <Check size={13} className="text-ok-500" /> Copied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Copy size={13} /> Copy
            </span>
          )}
        </motion.button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-forge-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
