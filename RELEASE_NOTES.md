## Paracore v4.7.0

### Performance & UI

- **REPL and Gallery are now independent modes** — no more nested Scripts toggle, three clean modes: Gallery, REPL, Playlist
- **shadcn/ui redesign** — consistent components, Cmd+K command palette, design tokens
- **Code-splitting** via React.lazy on REPL, CodeViewer, Playlists, and Settings
- **UI state extracted to Zustand** — flatter, faster, less re-rendering
- **Fuzzy search** with history in script gallery

### Addin

- **Simplified server toggle** — green/red indicator, no more TaskDialog popups
- **Dashboard removed** — the only ribbon button is the server toggle
- **Double-click** any script card in Gallery to jump directly to Configure

### Engine

- **`GetStr("Level")` works on every category** — Walls, Beams, Columns, Doors. No more guessing parameter names.
- **Unknown parameter warning** — diagnostic hint to use `.CombinedParams().Table()` for discovery
- **Pipeline tracking** for all LINQ methods

### Paracore MCP

- **Now a [separate installer](https://github.com/Sey56/paracore-mcp)** — previously bundled in the addin, now independently installable and updatable
- **In-app AI agent retired** — MCP clients (Claude Desktop, Cursor, VS Code) provide a far better harness
