# Day 04 — The "Magic to Freedom" Parameter Engine

## Scene 1: Introduction (5-Minute Fast Flow)
> [!IMPORTANT]
> Today is about **Parameter Engine v2 (v2.1.1)** — how your C# properties become a professional UI instantly.
> **Principle:** WYSIWYG (What You See Is What You Get). Inspect the UI, and if the "Magic" isn't what you want, use your "Freedom" to override it.

## Scene 2: The Fast-Paced Recap (Static Params)
- **Concept:** Simple C# properties = Standard UI elements.
- **Examples:**
    - `bool` -> Toggle Switch.
    - `double` + `[Range]` + `[Unit]` -> A slider with automatic metric/imperial conversion.
    - `List<string>` -> Dynamic Multi-Select checklist.

## Scene 3: The Four Pillars of `[RevitElements]`
We'll demonstrate how Paracore finds Revit elements using four real-world scenarios:

### 1. The Strategy 1 Shortcut (The Precise Path)
- **Attribute:** `[RevitElements(TargetType = "WallType")]`
- **Behavior:** Hits a hardcoded, optimized map. Instantly returns **Wall Types**.

### 2. The Strategy 2 Category (The Type Bias)
- **Attribute:** `[RevitElements(TargetType = "Walls")]`
- **Behavior:** Skips the shortcut, finds the "Walls" category, and defaults to **Types** to help you build things.

### 3. The Strategy 3 Reflection (The Literal Path)
- **Attribute:** `[RevitElements(TargetType = "Dimension")]`
- **Behavior:** Hits the literal C# class in the Revit API. Returns **Instances** (the placed dimensions) because that's what the class represents.

### 4. The "Freedom" Layer (_Options Masterpiece)
- **Attribute:** `[RevitElements(TargetType = "ViewSheet")]`
- **Problem:** In v2.1.1, "Magic" might get confused and return all Views instead of just Sheets.
- **The Solution:** Use `SheetName_Options` for total control. Get exactly what you want with professional formatting (`Number - Name`).

## Scene 4: AI Debugging (The Safety Net)
- **Explain & Fix:** Deliberately break a script with a typo.
- **The Wow:** One click for a plain-language explanation and an automated fix that updates your code live.

## Wrap Up: The WYSIWYG Workflow
1. **Define** your property.
2. **Inspect** the UI immediately.
3. **Validate** the data.
4. **Adjust** (Refine with `TargetType` or override with `_Options`).

**Paracore isn't just about automation — it's about the freedom to build exactly what you need.**
