import * as CSSWhat from "css-what";
import { findUp, pathExists } from "find-up";
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import {
  AtRule,
  ChildNode,
  Comment,
  Declaration,
  Root as RootNode,
  Rule,
} from "postcss";
import { parse as parseScssFile } from "postcss-scss";
import { fileURLToPath } from "url";

export const __dirname = dirname(fileURLToPath(import.meta.url));

export type Root = {
  type: "root";
  name: string;
  nodes: (Variable | Mixin | StyleRule)[];
};

type Mixin = {
  type: "mixin";
  comment?: string;
  name: string;
  included: boolean;
  nodes: (Variable | StyleRule)[];
};

export type StyleRule = {
  type: "style-rule";
  comment?: string;
  /** Rule selector, examples:
   * p, table, "h1 > span", .card, "#header.nav a" */
  selector: string;
  value: string;
};

export type Variable = {
  type: "variable";
  comment?: string;
  name: string;
  value: string;
};

const importedModules: Root[] = [];
export default async function parseScss(scssFilePath: string): Promise<Root> {
  const scssFolderPath = dirname(scssFilePath);
  // example: /path/to/module.scss -> module
  const moduleName = basename(scssFilePath, ".scss");

  const parsedRoot: Root = { type: "root", name: moduleName, nodes: [] };
  const rawScss = await readFile(scssFilePath, { encoding: "utf-8" });
  const rootNode: RootNode = parseScssFile(rawScss);

  let comment;
  for (const node of rootNode.nodes) {
    switch (node.type) {
      case "atrule":
        switch (node.name) {
          case "import": {
            const mod = await resolveImport(node, scssFolderPath);
            // get styles and variables that aren't defined inside of mixins
            parsedRoot.nodes.push(
              ...mod.nodes.filter((node) => node.type !== "mixin")
            );

            break;
          }
          case "include": {
            const mixin = includeMixin(node, parsedRoot.nodes);
            if (mixin) parsedRoot.nodes.push(mixin);
            break;
          }
          case "mixin":
            parsedRoot.nodes.push(parseMixin(node, parsedRoot.nodes, comment));
            break;
        }
        break;
      case "decl":
        parsedRoot.nodes.push(parseVariable(node, comment));
        break;
      case "rule":
        parsedRoot.nodes.push(...parseStyleRules(node, "", comment));
        break;
      case "comment":
        comment = parseComment(node);
        break;
    }
    if (node.type !== "comment") {
      comment = undefined;
    }
  }
  // for (const mod of importedModules) {
  // }
  return parsedRoot;
}

async function resolveImport(node: AtRule, basePath: string): Promise<Root> {
  // check if the import path exist for name.scss and _name.scss
  let importFilename = node.params.replace(/('|")/g, "");
  let importPath = join(basePath, importFilename + ".scss");
  if (!(await pathExists(importPath))) {
    importFilename = join(
      dirname(importFilename),
      "_" + basename(importFilename)
    );
    importPath = join(basePath, importFilename + ".scss");
  }
  if (!(await pathExists(importPath))) {
    throw new Error(`Failed to resolve the import: ${importFilename}`);
  }
  const mod = await parseScss(importPath);
  importedModules.push(mod);
  return mod;
}

function parseMixin(
  node: AtRule,
  additionalMixins: (Mixin | StyleRule | Variable)[] = [],
  comment?: string
): Mixin {
  const parsedMixin: Mixin = {
    type: "mixin",
    name: parseMixinName(node.params),
    nodes: [],
    included: false,
    comment,
  };
  let nestedComment;
  for (const childNode of node.nodes) {
    switch (childNode.type) {
      case "atrule": {
        if (childNode.name !== "include") break;
        const mixin = includeMixin(childNode, additionalMixins);
        parsedMixin.nodes.push(...(mixin?.nodes || []));
        break;
      }
      case "decl":
        parsedMixin.nodes.push(parseVariable(childNode, nestedComment));
        break;

      case "rule":
        parsedMixin.nodes.push(
          ...parseStyleRules(childNode, "", nestedComment)
        );
        break;
      case "comment":
        nestedComment = parseComment(childNode);
        break;
    }
    if (childNode.type !== "comment") {
      nestedComment = undefined;
    }
  }
  return parsedMixin;
}

function includeMixin(
  node: AtRule,
  additionalMixins: (Mixin | StyleRule | Variable)[] = []
): Mixin | undefined {
  const includedMixinName = parseMixinName(node.params);

  let includedMixin = importedModules
    .flatMap((module) => module.nodes)
    .concat(...additionalMixins)
    .find((n) => n.type === "mixin" && n.name === includedMixinName) as
    | Mixin
    | undefined;
  if (!includedMixin && node.parent?.parent) {
    // look for a mixin that is defined in the same file but after the include
    const futureDefinedMixinNode = (
      node.parent.parent.nodes as ChildNode[]
    ).find(
      (n) =>
        n.type === "atrule" &&
        n.name === "mixin" &&
        parseMixinName(n.params) === includedMixinName
    ) as AtRule | undefined;
    if (futureDefinedMixinNode)
      includedMixin = parseMixin(futureDefinedMixinNode);
  }
  if (!includedMixin) {
    console.warn(`Failed to resolve the included mixin: ${includedMixinName}`);
  } else {
    includedMixin.included = true;
  }
  return includedMixin;
}

function parseMixinName(rawName: string): string {
  return rawName.trim().replace(/\([\s\S]*\)/, "");
}

function parseComment(node: Comment): string {
  // Get rid of the trailing symbol * at the beginning of each line if exist
  return node.text.replace(/(\n)?\s*\*/g, "\n").trim();
}

function parseVariable(node: Declaration, comment?: string): Variable {
  return {
    type: "variable",
    name: node.prop,
    value: node.value.replace(/ !default$/, "").trim(),
    comment,
  };
}

function parseStyleRules(
  node: Rule,
  parentSelector = "",
  comment?: string
): StyleRule[] {
  const parsedStyleRules: StyleRule[] = [];
  let nestedComment;
  for (let selector of node.selectors) {
    selector = concatSelectors(parentSelector, selector);
    const value = node.source?.input.css.slice(
      node.source.start?.offset,
      node.source.end?.offset
    );
    parsedStyleRules.push({
      type: "style-rule",
      selector,
      value: value || "",
      comment,
    });
    for (const childNode of node.nodes) {
      switch (childNode.type) {
        case "rule":
          parsedStyleRules.push(
            ...parseStyleRules(childNode, selector, nestedComment)
          );
          if (nestedComment) nestedComment = undefined;
          break;

        case "comment":
          nestedComment = parseComment(childNode);
          break;
      }
    }
  }
  return parsedStyleRules;
}

function concatSelectors(selector1: string, selector2: string): string {
  selector1 = selector1.trim();
  selector2 = selector2.trim();
  const selector = selector1 + " " + selector2.replace(/^&/, "");
  return selector.trim();
}

export async function loadVanillaFrameworkPackage(
  workspacePath?: string
): Promise<Root> {
  if (!workspacePath) workspacePath = __dirname;
  let vanillaLibPath: string | undefined;
  vanillaLibPath = await findUp("node_modules/vanilla-framework/scss", {
    cwd: workspacePath,
    type: "directory",
  });
  if (!vanillaLibPath) {
    vanillaLibPath = await findUp("node_modules/vanilla-framework/scss", {
      cwd: __dirname,
      type: "directory",
    });
  }
  if (!vanillaLibPath) {
    throw new Error("Failed to locate the library vanilla-framework");
  }
  const parsedScssLib = await parseScss(join(vanillaLibPath, "_vanilla.scss"));
  return parsedScssLib;
}
