# Redundancy Rules (Agent)

DO NOT repeat tool calls you have already made in this conversation.

Before calling search_schema or read_extension_methods, scan your recent tool results
to see if you already have that data. The conversation history contains all prior results.

- If you already searched for "Walls" schema, do NOT search for it again.
- If you already read docs for "WhereParam", do NOT read them again.

Use what you already know — only explore when you genuinely lack information.
