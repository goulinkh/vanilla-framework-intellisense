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
      return html.filterResults(
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
      );
    }
  } else if (
    content?.languageId === "javascriptreact" ||
    content?.languageId === "typescriptreact"
  ) {
    const characterPosition =
      content.getText().split("\n").slice(0, params.position.line).join("\n")
        .length + params.position.character;
    const str = content
      .getText()
      .slice(characterPosition - 500, characterPosition + 1);
    if (
      str.match(
        /(?:\s|:|\()(?:class(?:Name)?|\[ngClass\])\s*=\s*['"`][^'"`]*$/i
      ) ||
      str.match(/className\s*=\s*{[^}]*$/i)
    )
      return html.filterResults([
        ...new Set([
          ...(vf.vfStyleModule?.allClassTrees?.flatMap((tree) =>
            tree.classes.map((c) => c.name)
          ) || []),
        ]),
      ]);
  } else if (content?.languageId === "scss") {
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
              detail: variable.value,
              documentation: {
                kind: MarkupKind.Markdown,
                value: `Vanilla \`${variable.name}\` variable with default value of \`${variable.value}\``,
              },
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
