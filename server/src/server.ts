/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { HTMLElement, parse as parseHtml } from "node-html-parser";
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
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { ClassTree, VanillaFramework } from "./vanilla-framework";
import { HTMLAutoCompletion } from "./html";
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
  console.log(`workspacePath`, workspacePath);
  if (workspacePath) {
    // Search for the package in the workspace
    await vf.loadPackage(workspacePath);
  }

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

// Cache the settings of all open documents

// Only keep settings for open documents

// The content of a text document has changed. This event is emitted
function findHtmlNodeFromRawText(
  text: { position: { line: number; character: number } },
  rawContent: string,
  document: HTMLElement
): HTMLElement | null {
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

// This handler provides the initial list of the completion items.
connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  // TODO: maybe use a backup of vanilla-framework if the package is not found
  if (!workspacePath) return [];
  const content = documents.get(params.textDocument.uri);
  if (content?.languageId === "html") {
    const parsedContent = parseHtml(content.getText());
    const element = findHtmlNodeFromRawText(
      params,
      content.getText(),
      parsedContent
    );
    if (element && vf.isLoaded) {
      /* 			return [...element?.classList.values()].map(
				(className: string) =>
					(console.log(className) as any) || {
						label: className,
						kind: CompletionItemKind.Class,
					}
			);
 */
      // TODO: urgent, get more context aware class names instead of all the classes

      // temporary function, get rid of as soon as possible
      const flattenClassTree = (classTree: ClassTree): string[] => {
        if (!classTree.children.length)
          return classTree.classes.map((c) => c.name);
        else
          return [
            ...classTree.classes.map((c) => c.name),
            ...classTree.children.flatMap(flattenClassTree),
          ];
      };
      return (
        vf.vfStyleModule?.allClassTrees?.flatMap(flattenClassTree) || []
      ).map((c) => ({ label: c, kind: CompletionItemKind.Class }));
    }
  }

  return [];
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = "TypeScript details";
    item.documentation = "TypeScript documentation";
  } else if (item.data === 2) {
    item.detail = "JavaScript details";
    item.documentation = "JavaScript documentation";
  }
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
