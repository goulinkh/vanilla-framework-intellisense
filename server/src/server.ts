/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
} from "vscode-languageserver/node.js";
import { findHtmlNodeFromRawText, getAvailableClassUtilities } from "./html.js";
import {
  loadVanillaFrameworkPackage,
  Root as VanillaLib,
} from "./scss-parser.js";
import { extractVanillaVariables } from "./scss.js";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
documents.listen(connection);
let workspacePath: string | undefined;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let vanillaLib: VanillaLib;
connection.onInitialize(async (params: InitializeParams) => {
  const capabilities = params.capabilities;

  workspacePath = params.workspaceFolders?.map((s) =>
    join(s.uri.replace(/^file:\/\//, ""))
  )[0];

  // Search for the package in the workspace
  vanillaLib = await loadVanillaFrameworkPackage(workspacePath);
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
  const languageId = content?.languageId;
  if (!content || !languageId) return [];
  const text = content.getText();
  const characterPosition =
    text.split("\n").slice(0, params.position.line).join("\n").length +
    params.position.character;
  const textUntilCursor = text.slice(0, characterPosition + 1);
  const canComplete = /(class|className)\s*=\s*("|')(?:(?!\2).)*$/is;
  if (languageId !== "scss" && !canComplete.exec(textUntilCursor)) return [];

  if (languageId === "html") {
    const element = findHtmlNodeFromRawText(params, text);
    if (!element) return [];

    const items = getAvailableClassUtilities(vanillaLib, element);
    return items;
  } else if (
    languageId === "javascriptreact" ||
    languageId === "typescriptreact" ||
    languageId === "django-html"
  ) {
    const items = getAvailableClassUtilities(vanillaLib);
    return items;
  } else if (languageId === "scss") {
    return extractVanillaVariables(vanillaLib);
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
