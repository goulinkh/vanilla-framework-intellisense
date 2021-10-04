/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { parse as parseHtml } from "node-html-parser";
import { join } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  createConnection,
  DidChangeConfigurationNotification,
  InitializedParams,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { HTMLAutoCompletion } from "./html";
import { VanillaFramework } from "./vanilla-framework";
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
documents.listen(connection);
const vf = new VanillaFramework();
const html = new HTMLAutoCompletion(vf);
let workspacePath: string | undefined;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize(async (params: InitializeParams) => {
  const capabilities = params.capabilities;

  workspacePath = params.workspaceFolders?.map((s) =>
    join(s.uri.replace(/^file:\/\//, ""))
  )[0];

  // Search for the package in the workspace
  await vf.loadPackage(workspacePath);

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized((params: InitializedParams) => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }

  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

type Component = {
  category: string;
  name: string;
  modifier: string;
};

const getDocsLink = ({ category, name }: Component) => {
  const baseComponents = ["heading", "text", "table"];
  const docsNames: Record<string, string> = {
    button: "buttons",
  };
  const categoryName = baseComponents.includes(name) ? "base" : category;
  const docsName: string = docsNames[name] || name;
  const linkBase = `vanillaframework.io/docs/${categoryName}/${docsName}`;

  return `[${linkBase}](https://${linkBase})`;
};

const generateComponentDocs = (className: string): string => {
  if (!className) return "";

  const component: Component = {
    category: className.split("-")[0] === "p" ? "patterns" : "utilities",
    name: className
      .slice(className.indexOf("-") + 1)
      .split("__")[0]
      .split("--")[0],
    modifier: className.split("--")[1] || "",
  };
  const componentNameCapital = component.name
    ? (component.name?.charAt(0).toUpperCase() + component.name?.slice(1))
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  return [
    `# ${componentNameCapital}`,
    component.modifier ? `## ${component.modifier}` : "",
    `### Documentation`,
    getDocsLink(component),
  ].join("\n");
};

// This handler provides the initial list of the completion items.
connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const content = documents.get(params.textDocument.uri);

  if (content?.languageId === "html") {
    const parsedContent = parseHtml(content.getText());
    const context = html.findHtmlNodeFromRawText(
      params,
      content.getText(),
      parsedContent
    );
    if (context && vf.isLoaded && html.isInsideClassValueField(context)) {
      const items = html.getAvailableClasses(context.element);
      return (
        [
          ...new Set([
            ...items.highScoreItems.map((i) => i.name),
            ...items.normalItems.map((i) => i.name),
            ...(vf.vfStyleModule?.allRootClassTrees?.flatMap((tree) =>
              tree.classes
                .map((c) => c.name)
                .filter((c) => !c.match(/^.+__.+$/))
            ) || []),
          ]),
        ]
          // example: p-link--external::after
          .filter((c) => !c.match(/:/))
          // example: l-fluid-breakout#{$suffix}
          .filter((c) => !c.match(/#{.*}/))
          // example: u-fixed-width &
          .filter((c) => !c.match(/&/))
          .map((i) => {
            const markdown = {
              kind: MarkupKind.Markdown,
              value: generateComponentDocs(i),
            };

            return {
              label: i,
              kind: CompletionItemKind.EnumMember,
              documentation: markdown,
            };
          })
      );
    }
  } else if (
    content?.languageId === "javascriptreact" ||
    content?.languageId === "typescriptreact"
  ) {
    return (
      [
        ...new Set([
          ...(vf.vfStyleModule?.allRootClassTrees?.flatMap((tree) =>
            tree.classes.map((c) => c.name).filter((c) => !c.match(/^.+__.+$/))
          ) || []),
        ]),
      ]
        // example: p-link--external::after
        .filter((c) => !c.match(/:/))
        // example: l-fluid-breakout#{$suffix}
        .filter((c) => !c.match(/#{.*}/))
        // example: u-fixed-width &
        .filter((c) => !c.match(/&/))
        .map((i) => ({
          label: i,
          kind: CompletionItemKind.EnumMember,
        }))
    );
  }
  if (content?.languageId === "scss") {
    if (vf.vfStyleModule?.allVariables) {
      const items: CompletionItem[] =
        vf.vfStyleModule.allVariables.map<CompletionItem>(
          (variable): CompletionItem => {
            return {
              label: variable.name,
              kind:
                variable.name.indexOf("color") >= 0
                  ? CompletionItemKind.Color
                  : CompletionItemKind.Variable,
              detail: `Vanilla ${variable.name} variable`,
            };
          }
        );
      return items;
    }
  }
  return [];
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
