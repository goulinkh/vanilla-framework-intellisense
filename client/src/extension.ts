/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from "path";
import { workspace, ExtensionContext, commands, window } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for HTML documents
    documentSelector: [
      { scheme: "file", language: "html" },
      { scheme: "file", language: "scss" },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "vanilla-framework",
    "Vanilla framework",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  registerSnippetsCommand([
    {
      name: "Card / Default",
      html: `<div class="p-card">
  <h3>We'd love to have you join us as a partner.</h3>
  <p class="p-card__content">If you are an independent software vendor or bundle author, it's easy to apply. You can find out more below.</p>
</div>`,
    },
    {
      name: "Button",
      html: `<button>Button</button>`,
    },
  ]);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

type Snippet = {
  name: string;
  html: string;
};
function registerSnippetsCommand(snippets: Snippet[]) {
  const snippetsCommand = "vanilla-framework-intellisense.vf-snippets";

  const onInsertSnippet = (snippetName: string) => {
    const snippet = snippets.find((s) => s.name === snippetName);
    const editor = window.activeTextEditor;
    if (!(editor && snippet)) return;
    editor.edit((editBuilder) => {
      const position = editor.selection.active;
      editBuilder.insert(position, snippet.html);
    });
  };
  const commandHandler = (_tite: string) => {
    window
      .showQuickPick(
        snippets.map(({ name }) => name),
        { title: "Select a code example:" }
      )
      .then(onInsertSnippet);
  };

  commands.registerCommand(snippetsCommand, commandHandler);
}
