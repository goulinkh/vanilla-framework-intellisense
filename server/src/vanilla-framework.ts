import * as fs from "fs";
import { promises as fsPromises } from "fs";
import { basename, dirname, join } from "path";
import { AtRule, ChildNode, Declaration, Root, Rule } from "postcss";
import { parse } from "postcss-scss";
import { promisify } from "util";
import findup = require("findup-sync");
import { Node } from "node-html-parser";
const exists = promisify(fs.exists);

export type StyleModule = {
  name: string;
  // @import list
  importedModules: StyleModule[];
  // @include list
  includedModules: StyleModule[];
  // .scss file
  filename: string;
  // @mixin list
  mixins: StyleBloc[];
  // list of global variables defined in this module
  variables: Variable[];

  /* these attributes are used for quick read and filter.
   * Read only and to recalculate after each change to the
   * previous attributes
   */
  allMixins?: Map<string, StyleBloc>;
  // all class tree roots, only the root node which can contains a nested children
  allRootClassTrees?: ClassTree[];
  // all class tress in the entire style module, used for easy read and search
  allClassTrees?: ClassTree[];
  allStyleModules?: Map<string, StyleModule>;
  // all global variables
  allVariables?: Variable[];
};

export type StyleBloc = {
  name: string;
  // class tree inside a @mixin
  classNamesTree: ClassTree[];
  // variables defined inside a .scss file
  variables: Variable[];
  // comment before a @mixin
  // TODO: not implemented yet

  includedStyleBlocs: string[];

  description?: string;
};

export type ClassTree = {
  // the class name, can have multiple classes in case of multiple
  // class selectors
  classes: ClassName[];

  // TODO: not implemented yet, could be used for css attributes
  // preview as a description for the class in completion mode
  rawStyle?: string;
  children: ClassTree[];
  // comment before a class name
  // TODO: not implemented yet
  description?: string;

  parent?: ClassTree;
};

export type ClassName = { name: string; isDirectChild: boolean };

export type Variable = {
  name: string;
  // comment before a variable
  // TODO: not implemented yet
  description?: string;
  value?: string;
};

export class VanillaFramework {
  private pathToScssFolder: string | null = null;
  public vfStyleModule: StyleModule | null = null;
  public isLoaded = false;

  async loadPackage(workspacePath?: string): Promise<boolean> {
    if (workspacePath)
      this.pathToScssFolder = await this.findPackageInWorkspace(workspacePath);
    if (!this.pathToScssFolder) {
      console.warn(
        `[Vanilla framework loader] Couldn't find an installed package of Vanilla framework relative to the folder ${workspacePath}, using a backup version of vanilla framework...`
      );
      this.pathToScssFolder = await this.findPackageInWorkspace(__dirname);
      if (!this.pathToScssFolder) {
        console.error(
          `[Vanilla framework loader] Could find a backup version of vanilla framework`
        );
        return false;
      }
    }
    try {
      console.log(
        "[Vanilla framework loader] started parsing vanilla framework package..."
      );
      this.vfStyleModule = await this.loadScssFile(
        "vanilla",
        join(this.pathToScssFolder, "_vanilla.scss")
      );
      this.linkDependencies(this.vfStyleModule);
      console.log(
        "[Vanilla framework loader] finished parsing vanilla framework package"
      );
    } catch (err) {
      console.error(
        `[Vanilla framework loader] failed to parse the vf.\n${err}`
      );
      console.debug(err);
      return false;
    }
    this.isLoaded = true;
    return true;
  }

  /**
   * Search for vanilla framework package folder (relative to the opened project)
   * @param workspacePath
   * @returns if found, the full path to vanilla framework scss folder
   */
  private async findPackageInWorkspace(
    workspacePath: string
  ): Promise<string | null> {
    const packagePath = await findup(
      "node_modules/vanilla-framework/scss/_vanilla.scss",
      {
        cwd: workspacePath,
      }
    );

    return packagePath?.replace(/_vanilla\.scss$/, "") || null;
  }

  async loadScssFile(
    importNamespace: string,
    path: string
  ): Promise<StyleModule> {
    const baseFolderPath = dirname(path);

    const root: Root = parse(
      await fsPromises.readFile(path, { encoding: "utf-8" })
    );

    const result: StyleModule = {
      name: importNamespace,
      importedModules: [],
      filename: path,
      mixins: [],
      includedModules: [],
      variables: [],
    };

    for (let i = 0; i < root.nodes.length; i++) {
      const node = root.nodes[i];

      if (node.type === "decl" && node.prop[0] === "$") {
        result.variables.push({
          name: node.prop,
          value: node.value.replace(" !default", ""),
        });
      }

      if (node.type === "atrule" && node.name === "import") {
        const importNamespace = node.params.replace(/(^('|")|('|")$)/g, "");
        let importPath = join(baseFolderPath, importNamespace);
        // file name
        let importFilename: null | string = basename(importPath) + ".scss";
        // full path to directory
        importPath = dirname(importPath);

        if (!(await exists(join(importPath, importFilename)))) {
          importFilename = `_${importFilename}`;
          if (!(await exists(join(importPath, importFilename)))) {
            // ignore dependency
            console.warn(
              `[Vanilla framework loader] Couldn't find the imported file ${importFilename} while loading ${path}`
            );
            importFilename = null;
          }
        }
        if (importFilename) {
          result.importedModules.push(
            await this.loadScssFile(
              importNamespace,
              join(importPath, importFilename)
            )
          );
        }
      } else if (node.type === "atrule" && node.name === "mixin") {
        result.mixins.push(await this.loadMixin(node));
      }
    }

    return result;
  }

  private linkDependencies(styleModule: StyleModule) {
    styleModule = this.loadAllMixinsAndModules(styleModule);
    styleModule.allMixins?.forEach((mixin) => {
      mixin.includedStyleBlocs.forEach((styleBlocNameToInclude) => {
        const styleBlocToMerge = styleModule.allMixins?.get(
          styleBlocNameToInclude
        );
        mixin.classNamesTree.push(...(styleBlocToMerge?.classNamesTree || []));
      });
    });
    return styleModule;
  }

  private loadAllMixinsAndModules(rootStyleModule: StyleModule): StyleModule {
    const mixins: Map<string, StyleBloc> = new Map();
    const variables: Variable[] = [];

    // Stop if already added this module (avoid circular dependency iterations)
    const exploredModules: Map<string, StyleModule> = new Map();

    const readModuleData = (styleModule: StyleModule) => {
      if (exploredModules.get(styleModule.name)) return;
      else {
        styleModule.mixins.forEach((mixin) => mixins.set(mixin.name, mixin));
        styleModule.variables.forEach((variable) => {
          if (variables.filter((v) => v.name === variable.name).length === 0) {
            variables.push(variable);
          }
        });
        exploredModules.set(styleModule.name, styleModule);
        styleModule.importedModules.forEach(readModuleData);
      }
    };

    readModuleData(rootStyleModule);
    rootStyleModule.allMixins = mixins;
    rootStyleModule.allVariables = variables;
    rootStyleModule.allRootClassTrees = Array.from(
      mixins.values() || []
    ).flatMap((mixin) => mixin.classNamesTree);
    // flat all class tree to one level for easy search

    rootStyleModule.allClassTrees = rootStyleModule.allRootClassTrees.flatMap(
      (ct) => this.deepFlattenClassNames(ct)
    );

    rootStyleModule.allStyleModules = exploredModules;
    return rootStyleModule;
  }

  deepFlattenClassNames(classTree: ClassTree, ignoreRoot = false): ClassTree[] {
    if (ignoreRoot)
      return [
        ...classTree.children.flatMap((ct) => this.deepFlattenClassNames(ct)),
      ];
    else
      return [
        classTree,
        ...classTree.children.flatMap((ct) => this.deepFlattenClassNames(ct)),
      ];
  }

  private async loadMixin(node: AtRule): Promise<StyleBloc> {
    const styleBloc: StyleBloc = {
      name: node.params,
      classNamesTree: [],
      variables: [],
      includedStyleBlocs: [],
    };

    node.nodes.forEach((node: ChildNode) => {
      // TODO: map this included rule with the parsed one, once the first parse is done
      if (node.type === "atrule" && node.name === "include") {
        styleBloc.includedStyleBlocs.push(node.params);
      }
      // classes selector
      else if (node.type === "rule") {
        // iterate through the classes tree
        const classTree = this.parseClassesTree(node);
        if (classTree) styleBloc.classNamesTree.push(classTree);
      }
    });

    return styleBloc;
  }

  private parseClassesTree(node: Rule, parent?: ClassTree): ClassTree | null {
    const classesList = this.getSubClasses(node.selectors);
    if (!classesList.length) return null;
    const classesTree: ClassTree = {
      children: [],
      classes: classesList,
      parent,
    };

    const children: Rule[] = node.nodes.filter(
      (node): node is Rule => node.type === "rule"
    );

    classesTree.classes.push(
      ...children.flatMap((childNode) =>
        this.getParentExtendedClasses(childNode.selectors, classesTree)
      )
    );

    classesTree.children = children
      .map((childNode) => this.parseClassesTree(childNode, classesTree))
      .filter((e): e is ClassTree => e !== null);
    return classesTree;
  }

  private getParentExtendedClasses(
    selectors: string[],
    parent: ClassTree
  ): ClassName[] {
    return selectors
      .flatMap((selector) => {
        // example: "&--light"
        if (selector.match(/^&[^\\.]+/)) {
          return parent.classes.flatMap((c) => ({
            name: c.name + selector.replace(/^&/, ""),
            isDirectChild: c.isDirectChild,
          }));
        }
      })
      .filter((e): e is ClassName => !!e);
  }

  private getSubClasses(selectors: string[]): ClassName[] {
    // We only need the class name selectors, not HTML tag selectors
    // or id selectors
    return selectors
      .map((selector) => {
        // example: ".p-card__image"
        // TODO: theses cases are ignored for now: ".test > .direct-child", ".test .sub-class"
        if (selector.match(/^\..+/)) {
          selector = selector.split(/\s+/)[0];
          return {
            name: selector.replace(/^\./, ""),
            isDirectChild: false,
          };
        }
        // example: "> .p-link--soft "
        else if (selector.match(/^>\s*\..+/))
          return {
            name: selector.replace(/^>\s*\./, ""),
            isDirectChild: true,
          };
        else return null;
      })
      .filter((e): e is ClassName => e !== null);
  }

  public static findClassTreeWith(
    className: string,
    classTree: ClassTree
  ): ClassTree | null {
    if (classTree.classes.find((c) => c.name === className)) return classTree;

    for (const child of classTree.children) {
      const matchingClassTree = this.findClassTreeWith(className, child);
      if (matchingClassTree) return matchingClassTree;
    }
    return null;
  }
}

async function main() {
  const vf = new VanillaFramework();
  const result = await vf.loadScssFile(
    "vanilla",
    join("./node_modules/vanilla-framework/scss/_vanilla.scss")
  );
}

main();
