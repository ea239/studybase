"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { copyText } from "@/lib/browser";
import "katex/dist/katex.min.css";

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <button
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="absolute top-1.5 right-1.5 rounded-md bg-white/70 px-2 py-0.5 text-[11px] text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-900"
      >
        {copied ? "已复制" : "复制"}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-neutral-900/[0.05] p-3 text-[13px] leading-relaxed">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  );
}

// Models are inconsistent about math delimiters — the same model emits
// \[ … \] one turn and $$ … $$ the next. remark-math only understands the
// dollar forms, so normalise rather than fight it with prompt wording.
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, body) => `\n$$${body}$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => `$${body}$`);
}

/**
 * Chat message renderer: GitHub-flavoured markdown plus LaTeX via KaTeX, so
 * formulas and code come out typeset instead of as raw backslashes.
 */
export function Markdown({ children }: { children: string }) {
  const source = normalizeMath(children);
  return (
    <div className="flex flex-col gap-2.5 [&_a]:text-blue-600 [&_a]:underline [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, "");
            // Fenced blocks arrive with a language class; bare inline code
            // doesn't, and must stay inside the sentence.
            if (!className?.includes("language-") && !text.includes("\n")) {
              return (
                <code className="rounded bg-neutral-900/[0.06] px-1 py-0.5 font-mono text-[0.9em]" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock text={text} />;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-neutral-900/10 bg-neutral-900/[0.04] px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-neutral-900/10 px-2 py-1">{children}</td>,
          h1: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
