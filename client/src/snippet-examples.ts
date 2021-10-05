import axios from "axios";
import { HTMLElement, parse } from "node-html-parser";
import { commands, window } from "vscode";

type Snippet = {
  name: string;
  html: string;
};

export const fetchDocExamples: () => Promise<Snippet[]> = async () => {
  try {
    const res = await axios.get("https://vanillaframework.io/docs/examples");

    const examplesDoc = parse(res.data);

    const snippets = await Promise.all(
      [
        ...examplesDoc.querySelectorAll(
          "#main-content > div.row > div > nav[aria-label*='base elements'] > ul > li > a"
        ),
        ...examplesDoc.querySelectorAll(
          "#main-content > div.row > div > nav[aria-label*='components'] > ul > li > a"
        ),
      ].map(async (e) => {
        const title = e.rawText;
        const res = await axios.get(
          `https://vanillaframework.io${e.getAttribute("href")}`
        );

        const exampleDoc = parse(res.data);
        const body = exampleDoc.querySelector("body");
        if(!body){
          return;
        }
        const bodyChildNodes: HTMLElement[] = body.childNodes
          .filter((e): e is HTMLElement => e.nodeType === 1)
          .filter((e) => e.rawTagName != "script");

        const snippetString: string[] = bodyChildNodes.map((e) => e.outerHTML);
        return { name: title, html: snippetString.join("\n") };
      })
    );
    return snippets.filter(e => e);
  } catch (error) {
    console.log(error);
  }
};

export function registerSnippetsCommand(snippets: Snippet[]) {
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

  const commandHandler = async (_tite: string) => {
    const selection = await window.showQuickPick(
      snippets.map(({ name }) => name),
      { title: "Select a code example:" }
    );
    onInsertSnippet(selection);
  };

  return commands.registerCommand(snippetsCommand, commandHandler);
}
