import * as CSSWhat from "css-what";
import { HTMLElement, parse as parseHtml } from "node-html-parser";
import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver";
import { Root as VanillaLib, StyleRule } from "./scss-parser";

export function getAvailableClassUtilities(
  vanillaLib: VanillaLib,
  element?: HTMLElement
): CompletionItem[] {
  let selectors = extractVanillaSelectors(vanillaLib);
  if (element) {
    const root = removeUnnecessaryNodes(element);
    selectors = selectors
      .filter((s) => {
        let matches = false;
        try {
          element.classList.add(s.class);
          matches = !!root.querySelector(s.selector);
        } catch {
          // ignore
        }
        element.classList.remove(s.class);
        return matches;
      })
      .sort((a, b) => b.score - a.score);
  }
  return selectors.map((s) => s.completionItem);
}

function removeUnnecessaryNodes(node: HTMLElement): HTMLElement {
  let parent;
  do {
    parent = node.parentNode;
    if (!parent) break;
    parent.childNodes = parent.childNodes.filter((n) => n == node);
    node = parent;
  } while (parent);
  return node;
}

type SelectorItem = {
  selector: string;
  class: string;
  comment?: string;
  score: number;
  completionItem: CompletionItem;
};

let vanillaClassUtilitySelectors: SelectorItem[];

function extractVanillaSelectors(vanillaLib: VanillaLib): SelectorItem[] {
  // extract the list of available css selectors from the Vanilla lib
  if (vanillaClassUtilitySelectors) return vanillaClassUtilitySelectors;
  // used to remove duplicates
  const classes = new Set();
  vanillaClassUtilitySelectors = vanillaLib.nodes
    .flatMap((n: any) => [...(n.nodes || []), n])
    .filter((e) => e.type === "style-rule")
    // example: %small-text -> .small-text
    .map((e: StyleRule) => ({
      ...e,
      selector: e.selector
        .replace("%", ".")
        .replace(/\s*(\+)?\s*&$/, "")
        .replace(/#\{.+\}/, ""),
    }))
    .map((s) => {
      try {
        const tree = CSSWhat.parse(s.selector);
        const lastNode =
          tree[tree.length - 1][tree[tree.length - 1].length - 1];
        if (
          lastNode.type === "attribute" &&
          lastNode.name === "class" &&
          lastNode.action === "element"
        ) {
          const className = lastNode.value;
          const linkToDocs = getComponentDocs(className);
          const documentationItems: string[] = [];
          if (s.comment) documentationItems.push(s.comment);
          if (linkToDocs) documentationItems.push("docs: " + linkToDocs);
          const documentation = {
            kind: MarkupKind.Markdown,
            value: documentationItems.join("\n\n"),
          };
          return {
            ...s,
            class: className,
            score: tree.flatMap((e) => e).length,
            completionItem: {
              label: className,
              kind: CompletionItemKind.EnumMember,
              documentation: documentation,
            },
          };
        }
      } catch {
        // ignore
      }
    })
    .filter((e?: SelectorItem) => !!e)
    .filter((e?: SelectorItem) =>
      classes.has(e?.class) ? false : classes.add(e?.class)
    ) as SelectorItem[];

  return vanillaClassUtilitySelectors;
}

export function findHtmlNodeFromRawText(
  text: { position: { line: number; character: number } },
  rawContent: string
): HTMLElement | null {
  const document = parseHtml(rawContent);

  const characterPosition =
    rawContent.split("\n").slice(0, text.position.line).join("\n").length +
    text.position.character;
  let deepestMatchingNode: HTMLElement | null = null;
  let reachedTheBottom = false;
  while (!reachedTheBottom) {
    // Check if the node is in the range and is of type HtmlElement (filter the TextNodes)
    const node: HTMLElement | undefined = (
      deepestMatchingNode || document
    ).childNodes.filter(
      (node) =>
        node.nodeType === 1 &&
        node.range[0] <= characterPosition &&
        node.range[1] >= characterPosition
    )[0] as HTMLElement;

    if (!node) {
      reachedTheBottom = true;
    } else {
      deepestMatchingNode = node;
    }
  }
  return deepestMatchingNode;
}

const getComponentDocs = (className: string): string | undefined => {
  if (!className) return "";

  const isWithCategoryPrefix = className.substring(0, 3).includes("-");
  const category =
    className.substring(0, 2) === "l-"
      ? "layouts"
      : className.substring(0, 2) === "u-"
      ? "utilities"
      : className.substring(0, 3) === "is-"
      ? "modifiers"
      : "patterns";

  const name = (
    isWithCategoryPrefix
      ? className.slice(className.indexOf("-") + 1)
      : className
  )
    .split("__")[0]
    .split("--")[0];

  const linkBase = `vanillaframework.io/docs/${category}/${name}`;

  return category !== "modifiers"
    ? `[${linkBase}](https://${linkBase})`
    : undefined;
};
