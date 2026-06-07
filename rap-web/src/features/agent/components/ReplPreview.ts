/**
 * Builds a markdown preview string from structured REPL output.
 *
 * Pure function — no React dependencies. Used by both the agent chat
 * and the REPL playground to show compact result previews.
 *
 * NOTE: The Python backend (agent/summarizer.py) already produces
 * summarized output. This function provides an additional client-side
 * preview layer for the chat UI.
 */
export function buildReplPreview(
  structuredOutput: Record<string, unknown>[],
  plainOutput: string
): string | null {
  const parts: string[] = [];

  if (Array.isArray(structuredOutput) && structuredOutput.length > 0) {
    for (const item of structuredOutput) {
      if (item.type === 'table') {
        try {
          const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
          if (Array.isArray(data) && data.length > 0) {
            const totalRows = data.length;
            const headers = Object.keys(data[0] as Record<string, unknown>);
            const rows = data.slice(0, 5).map((r: Record<string, unknown>) =>
              headers.map(h => String((r as Record<string, unknown>)[h] ?? ''))
            );
            const tableLines = [
              '| ' + headers.join(' | ') + ' |',
              '|' + headers.map(() => '---').join('|') + '|',
              ...rows.map(r => '| ' + r.join(' | ') + ' |'),
            ];
            parts.push(
              `**${item.title || 'Table'}** (${totalRows} rows, showing first ${rows.length}):\n${tableLines.join('\n')}`
            );
            if (totalRows > 5) {
              parts.push(
                `*...and ${totalRows - 5} more rows.*  \n*Run the generated code in the **REPL Playground** to see the full table in the **Analytics** tab.*`
              );
            }
          } else {
            parts.push(`**${item.title || 'Table'}**: empty (no data).`);
          }
        } catch {
          parts.push(`**${item.title || 'Table'}**: result available in Analytics tab.`);
        }
      } else if (['chart-bar', 'chart-pie', 'chart-line'].includes(String(item.type))) {
        parts.push(`*${item.title || String(item.type)} rendered in the Analytics tab.*`);
      }
    }
  }

  if (plainOutput && String(plainOutput).trim()) {
    const text = String(plainOutput).trim();
    const lines = text.split('\n');
    if (lines.length <= 5) {
      parts.push(`**Output:**\n\`\`\`\n${text}\n\`\`\``);
    } else {
      parts.push(
        `**Output** (${lines.length} lines, showing first 5):\n\`\`\`\n${lines.slice(0, 5).join('\n')}\n... and ${lines.length - 5} more lines\n\`\`\``
      );
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}
