import type { SafeBlock, SafeInline } from "@tarjuman/core";
import { createElement, type ReactElement, type ReactNode } from "react";
import { directionRuns } from "./bidi";
import { InertLink } from "./InertLink";

/**
 * Renders the OutputGuard's restricted AST and nothing else (Principle V). There is no case for
 * an image, raw HTML, a script, or a style because those node types do not exist, and any node
 * type this switch does not know renders as nothing. React escapes every string it is given, so
 * model text can never become markup. No `dangerouslySetInnerHTML` anywhere.
 */
export function SafeBlockRenderer({ blocks }: { blocks: readonly SafeBlock[] }): ReactElement {
  return <div className="safe-blocks">{blocks.map((block, i) => renderBlock(block, i))}</div>;
}

function renderBlock(block: SafeBlock, key: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key} dir="auto">{renderInlines(block.children)}</p>;
    case "heading":
      // The page title is the h1 and the screen sections are h2, so model headings start at h3.
      return createElement(`h${Math.min(block.level + 2, 6)}`, { key, dir: "auto" }, renderInlines(block.children));
    case "list": {
      const items = block.items.map((item, i) => <li key={i} dir="auto">{item.map((child, j) => renderBlock(child, j))}</li>);
      return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case "blockquote":
      return <blockquote key={key}>{block.children.map((child, i) => renderBlock(child, i))}</blockquote>;
    case "code_block":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <table key={key}>
          <thead>
            <tr>
              {block.header.map((cell, i) => (
                <th key={i}>{renderInlines(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{renderInlines(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return null;
  }
}

function renderInlines(nodes: readonly SafeInline[]): ReactNode {
  return nodes.map((node, i) => renderInline(node, i));
}

function renderInline(node: SafeInline, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return <BidiText key={key} text={node.text} />;
    case "emphasis":
      return <em key={key}>{renderInlines(node.children)}</em>;
    case "strong":
      return <strong key={key}>{renderInlines(node.children)}</strong>;
    case "code":
      return <code key={key}>{node.text}</code>;
    case "break":
      return <br key={key} />;
    case "link":
      return (
        <InertLink key={key} destination={node.destination} destinationDisplay={node.destinationDisplay}>
          {renderInlines(node.children)}
        </InertLink>
      );
    default:
      return null;
  }
}

/** Text with each run of the opposite direction isolated, so mixed-script lines keep their order. */
function BidiText({ text }: { text: string }): ReactElement {
  return (
    <>
      {directionRuns(text).map((run, i) => (run.isolate ? <bdi key={i}>{run.text}</bdi> : run.text))}
    </>
  );
}
