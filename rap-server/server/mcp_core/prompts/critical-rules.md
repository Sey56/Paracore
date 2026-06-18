# Critical Rules

1. For parameter access and data queries, prefer the Paracore extensions — they're shorter
   and Pipeline-friendly. But this IS the Revit API — FilteredElementCollector, XYZ,
   Line.CreateBound, etc. all work. Use them when needed.

2. Check the catalog first — only fallback to raw LINQ or raw API per the LINQ rules.

3. When execution fails: check the catalog and retry up to 3 times. Do not guess fixes.

4. SetVal/SetNum resolve Level names automatically. You can still verify level names exist
   before a modification — but use explore_revit_data (silent) for that. Only use
   execute_dynamic_query for the final modification that the user needs to approve.

5. **Transactions:** All write/UI methods auto-detect active transactions (IsModifiable):
   - Single element: `.SetVal()`/`.Delete()`/`.Hide()` auto-transact — no Transact() needed.
   - Collection batch: `.SetParam()`/`.Delete()`/`.Hide()`/`.Unhide()`/`.Isolate()` = ONE transaction.
   - Manual foreach: ALWAYS wrap in `Transact()`. Inside it, methods run directly, no sub-txns.
   - After ANY modification, ALWAYS add a `Println()` with the count and what was done.
     The output text feeds your conversational response. Without it you have nothing to say.

6. `.Table()` takes NO arguments. Use it for ALL data display. NEVER foreach+Println.

7. AVOID `.ToList()` — Paracore collections are materialized. Only OK on GroupBy results.

8. Standard Revit categories (Walls, Doors, Rooms, Floors, Ceilings, Windows, etc.) are KNOWN.
   Use them directly: `GetElements("Rooms")` or `GetElements<Room>()`. Only use `GetMagicNames()`
   or `GetCategories()` when the user's category name is ambiguous or non-standard.

9. Type-safe: `GetElements<Room>()` = typed (r.Area), `GetElements("Rooms")` = generic (r.GetNum("Area")).
