import { HTMLElement } from "node-html-parser";
import { VanillaFramework } from "./vanilla-framework";
export class HTMLAutoCompletion {
  constructor(private vfService: VanillaFramework) {}

  getAvailableClasses(element: HTMLElement) {
    // if (!this.vfService.isLoaded) return;
    // const classTrees = (this.vfService.vfStyleModule?.allClassTrees||[])
    // classTrees.
    // Array.from(element.parentNode.classList.values()).map(className=>VanillaFramework.findClassTreeWith(className,))
    // const directChildClasses =
  }
}
