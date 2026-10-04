import type { SafeBlock, SafeInline } from "@tarjuman/core";
import { createElement, type ReactElement, type ReactNode } from "react";

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
      return <p key={key}>{renderInlines(block.children)}</p>;
    case "heading":
      // The page title is the h1 and the screen sections are h2, so model headings start at h3.
      return createElement(`h${Math.min(block.level + 2, 6)}`, { key }, renderInlines(block.children));
    case "list": {
      const items = block.items.map((item, i) => <li key={i}>{item.map((child, j) => renderBlock(child, j))}</li>);
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
      return node.text;
    case "emphasis":
      return <em key={key}>{renderInlines(node.children)}</em>;
    case "strong":
      return <strong key={key}>{renderInlines(node.children)}</strong>;
    case "code":
      return <code key={key}>{node.text}</code>;
    case "break":
      return <br key={key} />;
    case "link":
      // Inert for now: the text plus the real destination, with no anchor, so nothing can
      // navigate or load. T103 replaces this with `InertLink`, which opens only on explicit action.
      return (
        <span key={key} className="inert-link">
          {renderInlines(node.children)} <code className="inert-link__destination">{node.destinationDisplay}</code>
        </span>
      );
    default:
      return null;
  }
}
