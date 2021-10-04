// import axios from "axios";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HTMLParser = require("node-html-parser");

const fetchDocExamples = async () => {
  try {
    const res = await axios.get("https://vanillaframework.io/docs/examples");

    const examplesDoc = HTMLParser.parse(res.data);

    const snippets = await Promise.all(
      [
        ...examplesDoc.querySelectorAll(
          "#main-content > div.row > div:nth-child(1) > nav > ul > li > a"
        ),
      ].map(async (e) => {
        const title = e.rawText;
        const res = await axios.get(
          `https://vanillaframework.io${e.getAttribute("href")}`
        );

        const exampleDoc = HTMLParser.parse(res.data);
        const body = exampleDoc.querySelector("body");
        const bodyChildNodes = body.childNodes.filter((e) => {
          return e.nodeType === 1 && e.rawTagName != "script";
        });

        const snippetString = bodyChildNodes.map((e) => e.outerHTML);
        return {html: snippetString.join("\n"), title};
        
      })
    );
	return snippets;
  } catch (error) {
    console.log(error);
  }
};

fetchDocExamples();
