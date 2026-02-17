"use client";

import { memo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { Check, Copy } from "lucide-react";

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const el = node as { props: { children?: React.ReactNode } };
    return extractText(el.props.children);
  }
  return "";
}

const components: Components = {
  // Code blocks & inline code
  pre({ children }) {
    // Extract language and code string from the nested <code>
    const codeChild = children as React.ReactElement<{
      className?: string;
      children?: React.ReactNode;
    }>;
    const className = codeChild?.props?.className ?? "";
    const lang = className.replace(/^language-/, "").replace(/^hljs\s*/, "");
    const code = extractText(codeChild?.props?.children).replace(/\n$/, "");

    return (
      <div className="group my-3 overflow-hidden rounded-lg border border-border bg-muted/50">
        <div className="flex items-center justify-between border-b border-border bg-muted/80 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {lang || "text"}
          </span>
          <CopyButton code={code} />
        </div>
        <div className="overflow-x-auto p-4">
          <pre className="!m-0 !bg-transparent !p-0 text-[13px] leading-relaxed">
            {children}
          </pre>
        </div>
      </div>
    );
  },

  code({ className, children, ...props }) {
    // If wrapped in <pre>, it's a code block — just render the code element
    const isBlock = className?.includes("language-") || className?.includes("hljs");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} !bg-transparent`} {...props}>
          {children}
        </code>
      );
    }
    // Inline code
    return (
      <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },

  // Headings
  h1({ children }) {
    return (
      <h1 className="mb-4 mt-6 text-2xl font-bold tracking-tight text-foreground first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-3 mt-5 text-xl font-semibold tracking-tight text-foreground first:mt-0">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-2 mt-4 text-lg font-semibold text-foreground first:mt-0">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="mb-2 mt-3 text-base font-semibold text-foreground first:mt-0">
        {children}
      </h4>
    );
  },

  // Paragraphs
  p({ children }) {
    return <p className="my-2 leading-7 text-foreground [&:first-child]:mt-0 [&:last-child]:mb-0">{children}</p>;
  },

  // Links
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors"
      >
        {children}
      </a>
    );
  },

  // Lists
  ul({ children }) {
    return <ul className="my-2 ml-1 list-none space-y-1.5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 ml-1 list-none space-y-1.5">{children}</ol>;
  },
  li({ children }) {
    return (
      <li className="relative pl-6 leading-7">
        {children}
      </li>
    );
  },

  // Blockquotes
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-[3px] border-primary/40 pl-4 italic text-muted-foreground [&>p]:text-muted-foreground">
        {children}
      </blockquote>
    );
  },

  // Horizontal rule
  hr() {
    return <hr className="my-6 border-border" />;
  },

  // Tables
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="border-b border-border bg-muted/50">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-border">{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="transition-colors hover:bg-muted/30">{children}</tr>;
  },
  th({ children }) {
    return (
      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="px-4 py-2.5 text-foreground">{children}</td>;
  },

  // Strong & emphasis
  strong({ children }) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  del({ children }) {
    return <del className="text-muted-foreground line-through">{children}</del>;
  },

  // Images
  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className="my-3 max-w-full rounded-lg border border-border"
      />
    );
  },

  // Task lists (GFM)
  input({ checked, ...props }) {
    return (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mr-2 rounded border-border accent-primary"
        {...props}
      />
    );
  },
};

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
