/**
 * AI instructions for generating Paracore gallery scripts.
 *
 * CANONICAL SOURCE: ..\\docs\\copilot-instructions.md (shared Paracore docs).
 *
 * These instructions are written to .github/copilot-instructions.md
 * when a workspace is scaffolded, teaching VS Code AI assistants
 * (Copilot, Cline, etc.) how to generate Paracore gallery scripts
 * with editable Params classes.
 */

import * as fs from "fs";
import * as path from "path";

function loadInstructions(): string {
  // Search paths for the canonical file — try shared docs first
  const searchPaths = [
    // Dev: shared container docs (__dirname = src/ → corescript-vscode/ → paracore/ → container/)
    path.join(__dirname, "..", "..", "..", "docs", "copilot-instructions.md"),
    // Production: bundled in extension root (__dirname = dist/)
    path.join(__dirname, "..", "copilot-instructions.md"),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  }

  console.warn(
    "Paracore: copilot-instructions.md not found. AI script generation may produce suboptimal code."
  );
  return `# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.

Generate C# Revit API scripts for the Paracore runtime (CoreScript.Engine).

See the Paracore documentation for complete scripting reference.
`;
}

export const COPILOT_INSTRUCTIONS: string = loadInstructions();
