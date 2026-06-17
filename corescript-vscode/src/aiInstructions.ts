/**
 * AI instructions for generating Paracore gallery scripts.
 *
 * CANONICAL SOURCE: ai-instructions.md in the Paracore repo root.
 * Update that file — this module reads it at runtime.
 *
 * These instructions are written to .github/copilot-instructions.md
 * when a workspace is scaffolded, teaching VS Code AI assistants
 * (Copilot, Cline, etc.) how to generate Paracore gallery scripts
 * with editable Params classes.
 */

import * as fs from "fs";
import * as path from "path";

function loadInstructions(): string {
  // Search paths for the canonical file
  const searchPaths = [
    // Production: extension root (__dirname = dist/, so .. = extension root)
    path.join(__dirname, "..", "ai-instructions.md"),
    // Dev: repo root (__dirname = src/ in ts-node, .. = corescript-vscode/, ../.. = repo root)
    path.join(__dirname, "..", "..", "ai-instructions.md"),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  }

  // If the canonical file isn't found (shouldn't happen), return a
  // minimal instructions stub. The file should be included in the
  // VS Code extension bundle.
  console.warn(
    "Paracore: ai-instructions.md not found. AI script generation may produce suboptimal code."
  );
  return `# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.

Generate C# Revit API scripts for the Paracore runtime (CoreScript.Engine).

See the Paracore documentation for complete scripting reference.
`;
}

export const COPILOT_INSTRUCTIONS: string = loadInstructions();
