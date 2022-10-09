import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver";
import { Root as VanillaLib, Variable } from "./scss-parser";

let vanillaClassUtilitySelectors: CompletionItem[];

export function extractVanillaVariables(
  vanillaLib: VanillaLib
): CompletionItem[] {
  if (vanillaClassUtilitySelectors) return vanillaClassUtilitySelectors;
  const classes = new Set();
  vanillaClassUtilitySelectors = vanillaLib.nodes
    .flatMap((n: any) => [...(n.nodes || []), n])
    .filter((n) => n.type === "variable")
    .map((n: Variable) => ({
      label: n.name,
      kind:
        n.name.indexOf("color") >= 0
          ? CompletionItemKind.Color
          : CompletionItemKind.Variable,
      detail: n.value,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Vanilla \`${n.name}\` variable with default value of \`${n.value}\``,
      },
    }))
    .filter((e?: CompletionItem) =>
      classes.has(e?.label) ? false : classes.add(e?.label)
    ) as CompletionItem[];
  return vanillaClassUtilitySelectors;
}
