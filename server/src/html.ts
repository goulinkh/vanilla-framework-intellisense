import { HTMLElement } from "node-html-parser";
import { ClassName, ClassTree, VanillaFramework } from "./vanilla-framework";

export type CompletionItems = {
  highScoreItems: ClassName[];
  normalItems: ClassName[];
};
export class HTMLAutoCompletion {
  constructor(private vfService: VanillaFramework) {}

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
            ct.classes.filter((c) => c.name.match(new RegExp(`^${className}.+`)))
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
}
