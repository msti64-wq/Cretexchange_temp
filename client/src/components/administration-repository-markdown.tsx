import { Fragment, type ReactNode } from "react";

const identifierPattern = /\b(?:CTX-[A-Z]+-\d{3}(?:-[A-Z-]+)?|ADR-\d{3}|PD-\d{3}|PB-\d{3})\b/g;

function linkedText(value: string, knownIdentifiers: Set<string>, key: number): ReactNode[] {
  const parts = value.split(identifierPattern);
  const identifiers = value.match(identifierPattern) || [];
  return parts.flatMap((part, index) => {
    const result: ReactNode[] = [];
    if (part) result.push(<Fragment key={`${key}-text-${index}`}>{part}</Fragment>);
    const identifier = identifiers[index];
    if (identifier) result.push(knownIdentifiers.has(identifier) ? <a className="text-primary underline underline-offset-4" href={`/admin/administration-repository/document/${identifier}`} key={`${key}-identifier-${index}`}>{identifier}</a> : <Fragment key={`${key}-identifier-${index}`}>{identifier}</Fragment>);
    return result;
  });
}

function inline(value: string, knownIdentifiers: Set<string>): ReactNode[] {
  const parts = value.split(/(!\[[^\]]*\]\([^\s)]+\)|\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.filter(Boolean).map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\([^\s)]+\)$/);
    if (image) return <span className="inline-flex rounded bg-muted px-2 py-1 text-xs text-muted-foreground" key={index}>Image omitted for safety{image[1] ? `: ${image[1]}` : ""}</span>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) {
      const href = link[2];
      const governedIdentifier = `${link[1]} ${href}`.match(/\b(?:CTX-(?:STD|ARCH|DEP|DB)-\d{3}|CTX-OPS-\d{3}|ADR-\d{3}|PD-\d{3})\b/)?.[0];
      if (governedIdentifier && knownIdentifiers.has(governedIdentifier) && !/^https?:\/\//.test(href)) return <a className="text-primary underline underline-offset-4" href={`/admin/administration-repository/document/${governedIdentifier}`} key={index}>{link[1]}</a>;
      if (/^(https?:\/\/|\/|#)/.test(href)) return <a className="text-primary underline underline-offset-4" href={href} key={index} rel={href.startsWith("http") ? "noreferrer" : undefined} target={href.startsWith("http") ? "_blank" : undefined}>{link[1]}</a>;
      return <Fragment key={index}>{link[1]}</Fragment>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{linkedText(part, knownIdentifiers, index)}</Fragment>;
  });
}

const isDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export function AdministrationRepositoryMarkdown({ body, knownIdentifiers = new Set<string>() }: { body: string; knownIdentifiers?: Set<string> }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim(); const code: string[] = []; index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) { code.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push(<pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50" key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as keyof JSX.IntrinsicElements;
      const className = heading[1].length === 1 ? "mt-8 text-3xl font-bold tracking-tight" : heading[1].length === 2 ? "mt-7 text-2xl font-semibold tracking-tight" : "mt-5 text-lg font-semibold";
      blocks.push(<Tag className={className} key={`heading-${index}`}>{inline(heading[2], knownIdentifiers)}</Tag>); index += 1; continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = []; while (index < lines.length && lines[index].startsWith(">")) { quote.push(lines[index].replace(/^>\s?/, "")); index += 1; }
      blocks.push(<blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground" key={`quote-${index}`}>{inline(quote.join(" "), knownIdentifiers)}</blockquote>); continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isDivider(lines[index + 1])) {
      const headers = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) { rows.push(cells(lines[index])); index += 1; }
      blocks.push(<div className="overflow-x-auto" key={`table-${index}`}><table className="w-full border-collapse text-sm"><thead><tr className="border-b bg-muted/50">{headers.map((header, headerIndex) => <th className="p-2 text-left font-semibold" key={headerIndex}>{inline(header, knownIdentifiers)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr className="border-b" key={rowIndex}>{headers.map((_, cellIndex) => <td className="p-2 align-top" key={cellIndex}>{inline(row[cellIndex] || "", knownIdentifiers)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const list = line.match(/^\s*([-*+] |\d+\. )(.+)$/);
    if (list) {
      const ordered = /^\s*\d+\. /.test(line); const items: string[] = [];
      while (index < lines.length && /^\s*(?:[-*+] |\d+\. )/.test(lines[index])) { items.push(lines[index].replace(/^\s*(?:[-*+] |\d+\. )/, "")); index += 1; }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6`} key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, knownIdentifiers)}</li>)}</List>); continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr className="my-6 border-border" key={`hr-${index}`} />); index += 1; continue; }
    const paragraph: string[] = [line.trim()]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|>|\s*(?:[-*+] |\d+\. ))/.test(lines[index]) && !(lines[index].includes("|") && index + 1 < lines.length && isDivider(lines[index + 1]))) { paragraph.push(lines[index].trim()); index += 1; }
    blocks.push(<p className="leading-7" key={`paragraph-${index}`}>{inline(paragraph.join(" "), knownIdentifiers)}</p>);
  }
  return <article className="space-y-4 text-foreground">{blocks}</article>;
}
