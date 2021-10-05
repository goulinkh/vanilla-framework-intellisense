import { HTMLElement } from "node-html-parser";
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver-types';
import { ClassName, ClassTree, VanillaFramework } from "./vanilla-framework";

export type CompletionItems = {
  highScoreItems: ClassName[];
  normalItems: ClassName[];
};

export type HTMLElementContext = {
  element: HTMLElement;
  position: {
    line: number;
    characterToLine: number;
    character: number;
  };
  text: string;
};
export class HTMLAutoCompletion {
  constructor(private vfService: VanillaFramework) {}
  // The content of a text document has changed. This event is emitted
  findHtmlNodeFromRawText(
    text: { position: { line: number; character: number } },
    rawContent: string,
    document: HTMLElement
  ): HTMLElementContext | null {
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
    if (deepestMatchingNode)
      return {
        element: deepestMatchingNode,
        position: {
          line: text.position.line,
          characterToLine: text.position.character,
          character: characterPosition,
        },
        text: rawContent,
      };
    else return null;
  }

  getAvailableClasses(element: HTMLElement): CompletionItems {
    const result: CompletionItems = { highScoreItems: [], normalItems: [] };
    if (!this.vfService.isLoaded) return result;
    const classTrees = this.vfService.vfStyleModule?.allClassTrees || [];
    let parentNode = element.parentNode;
    const items: { class: ClassName; tree: ClassTree }[] = [];
    // Direct parent
    if (parentNode) {
      result.highScoreItems.push(
        ...Array.from(parentNode.classList.values()).flatMap((className) =>
          classTrees.flatMap((ct) =>
            ct.classes.filter((c) =>
              c.name.match(new RegExp(`^${className}.+`))
            )
          )
        )
      );
    }

    while (parentNode) {
      items.push(
        ...Array.from(parentNode.classList.values()).flatMap((className) =>
          classTrees
            .map((ct) => ({
              class: ct.classes.find((c) => c.name === className),
              tree: ct,
            }))
            .filter(
              (e): e is { class: ClassName; tree: ClassTree } =>
                !!e.class && e.tree.children.length > 0
            )
        )
      );
      parentNode = parentNode.parentNode;
    }

    items.forEach((item) => {
      result.highScoreItems.push(
        ...item.tree.children
          .map((c) => c.classes.find((c) => c.isDirectChild))
          .filter((e): e is ClassName => !!e)
      );

      result.normalItems.push(
        ...this.vfService
          .deepFlattenClassNames(item.tree, true)
          .flatMap((ct) => ct.classes)
      );
    });

    return result;
  }

  isInsideClassValueField(context: HTMLElementContext): boolean {
    const str = context.text.slice(
      context.position.character - 500,
      context.position.character + 1
    );
    return (
      !!str.match(
        /(?:\s|:|\()(?:class(?:Name)?|\[ngClass\])\s*=\s*['"`][^'"`]*$/i
      ) || !!str.match(/className\s*=\s*{[^}]*$/i)
    );
  }

  filterResults(elements: string[]): CompletionItem[] {
    return elements
      // example: p-link--external::after
      .filter((c) => !c.match(/:/))
      // example: l-fluid-breakout#{$suffix}
      .filter((c) => !c.match(/#{.*}/))
      // example: u-fixed-width &
      .filter((c) => !c.match(/&/))
      .map((i) => ({ label: i, kind: CompletionItemKind.EnumMember }))
  }
}
