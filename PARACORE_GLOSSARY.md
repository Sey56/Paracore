# Paracore Automation Foundry: The Glossary of Truth

This document defines the strict terminology and conceptual model for the Paracore ecosystem. These terms must be used consistently across the UI, Documentation, and Codebase to ensure a professional and cohesive user experience.

---

## 1. Core Identity

### **The Automation Foundry**
*   **Definition:** The overarching ecosystem where users create, manage, and deploy BIM automation. It is not just a "library"; it is a place of creation ("Forging").
*   **Usage:** Sidebar Header, App Title ("Paracore Automation Foundry").

---

## 2. The Three Pillars (Units of Work)

All items in the Foundry are **Automation Units**. They fall into three strict categories based on their **Form** (Editable vs. Sealed) and **Function** (Manual vs. Background).

### **1. Script** (The Source)
*   **Definition:** A live, editable C# project folder containing source code. It is the raw material of the Foundry.
*   **Form:** A folder on disk containing `Scripts/Name.cs` and `.csproj`.
*   **Behavior:** Can be edited in VS Code. Supports "Hot-Reload" in Revit.
*   **Visual Identity:** **Blue** Accent. Icon: `faFileCode`.
*   **User Action:** "Edit Script", "Run Script".

### **2. Tool** (The Product)
*   **Definition:** A compiled, sealed, and portable automation package. It is a "Finished Product" designed for distribution and reliability.
*   **Form:** A single `.ptool` file (JSON + Binary Assembly).
*   **Behavior:** Read-only. Cannot be edited. Parameters are fixed or user-input only.
*   **Visual Identity:** **Muted Steel/Indigo** Accent. Icon: `faCube` (Package).
*   **User Action:** "Run Tool".

### **3. Sentinel** (The Guardian)
*   **Definition:** A specialized automation unit designed **exclusively** for background monitoring (Watchdog). It is a "Service" rather than a task.
*   **Form:**
    *   **Draft Sentinel:** A **Script** that contains `Watchdog()` logic. (Editable).
    *   **Sealed Sentinel:** A single `.wtool` file. (Binary, Optimized).
*   **Behavior:** Runs automatically on Revit idle/events. Can be "Armed" or "Disarmed".
*   **Visual Identity:** **Royal Gold** Accent. Icon: `faShieldHeart`.
*   **User Action:** "Arm Sentinel", "Disarm Sentinel".

---

## 3. File Extensions & formats

| Term | Extension | Description |
| :--- | :--- | :--- |
| **Script** | `Folder/` | A standard folder containing `.cs` files and a `.paracore` marker. |
| **Tool** | `.ptool` | **P**aracore **Tool**. A compiled binary for manual execution. |
| **Sentinel** | `.wtool` | **W**atchdog **Tool**. A compiled binary for background execution. |

---

## 4. User Interface Zones

### **Sidebar**
*   **Name:** **Automation Foundry**.
*   **Sections:**
    *   **Sources**: The folders on disk where Scripts and Tools live.
    *   **Favorites**: Pinned items for quick access.
    *   **Recent**: History of executed units.

### **Gallery** (Main View)
*   **Name:** **Foundry Floor**.
*   **Filters:**
    *   **All**: Everything.
    *   **Scripts**: Editable folders.
    *   **Tools**: `.ptool` binaries.
    *   **Sentinels**: `.wtool` binaries (and Draft Sentinel Scripts).
    *   **Active**: Currently armed Sentinels.

### **Inspector** (Right Panel)
*   **Name:** **Script Inspector**.
*   **Tabs:**
    *   **Parameters**: Input configuration.
    *   **Console**: Execution logs and output.
    *   **Metadata**: Information about the unit.

---

## 5. Verbs (Actions)

| Action | Meaning |
| :--- | :--- |
| **Forge** | To compile a **Script** into a **Tool** or **Sentinel**. |
| **Arm** | To activate a **Sentinel** for background monitoring. |
| **Disarm** | To stop a **Sentinel** from monitoring. |
| **Scaffold** | To generate the initial C# project files for a **Script**. |
| **Unload** | To remove a Source folder from the Foundry sidebar (does not delete files). |

---

## 6. Deprecated Terms (DO NOT USE)

*   ~~Project~~ (Use **Script**)
*   ~~Workspace~~ (Use **Script** or **Script Environment**)
*   ~~P-Tool~~ (Use **Tool**)
*   ~~W-Tool~~ (Use **Sentinel**)
*   ~~Guard~~ (Use **Sentinel**)
*   ~~Watchdog~~ (Use **Sentinel** in UI, `Watchdog` in Code)
*   ~~Binary Guard~~ (Use **Sentinel**)
