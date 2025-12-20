# Paracore (formerly rap-web) - The UI for the Revit Automation Platform

**Paracore** is the modern desktop interface for the **Revit Automation Platform (RAP)**, a complete ecosystem for creating, managing, and executing C# automation scripts for Autodesk Revit. Built with React and Tauri, Paracore provides a rich, intuitive, and multi-modal environment that caters to everyone from daily Revit users to advanced automation engineers.

## The Revit Automation Platform Ecosystem

Paracore is the user-facing component of a decoupled, robust architecture:

-   **Paracore (`rap-web`):** The React & Tauri desktop frontend. It provides the user interface for all three automation modes and communicates with the local backend via HTTP.
-   **Local Backend (`rap-server`):** A local Python/FastAPI server that acts as a gateway. It manages file system access and translates frontend requests into secure gRPC calls to the Revit add-in.
-   **Revit Add-in (`Paracore.Addin`):** A C# add-in hosting a gRPC server inside Revit. It is the only component that directly and safely interacts with the Revit API, using `ExternalEvent` handlers for thread-safe execution.
-   **Script Engine (`CoreScript.Engine`):** A powerful Roslyn-based C# compiler, hosted by the add-in, that dynamically executes scripts with full support for parameter injection and isolated execution contexts.
-   **Authentication Server (`rap-auth-server`):** A cloud-based service for managing user accounts, teams, roles, and licenses for premium features.

## Three Modes of Automation

Paracore offers three distinct modes, making automation accessible to all skill levels.

### 1. Manual Automation (The Core Experience)

This is the foundational mode of Paracore, designed for scripters and the users they support. It provides a complete, end-to-end workflow for managing and running a library of C# scripts.

-   **Script Gallery:** Browse and manage scripts stored in local folders or cloned from Git repositories.
-   **Script Inspector:** Select a script to instantly see its documentation and have its parameters rendered in a clean UI for easy input.
-   **Parameter Presets:** Save and load multiple parameter configurations for scripts that are used often with different settings.
-   **Rich Output:** View script results not just as text in a console, but as structured data like tables in a dedicated "Summary" tab.
-   **VS Code Integration:** Edit scripts with full C# IntelliSense in VS Code. Paracore automatically creates a temporary, pre-configured `.csproj` workspace and live-syncs any changes back to your original file.

### 2. AI Script Generation

For developers looking to accelerate their workflow, this mode uses AI to generate new scripts from a natural language prompt.

-   **Prompt-Based Creation:** Describe the tool you need (e.g., "Create a script that renumbers all selected doors based on the room they are in").
-   **AI-Powered Generation:** Paracore sends the request to the backend, which leverages a large language model to generate the C# code.
-   **Save to Library:** The generated script can be immediately saved to your script library and used in the Manual Automation mode.

### 3. Agentic Automation (The Paracore Agent)

The most accessible mode, designed for all Revit users, regardless of technical skill. The Paracore Agent provides a conversational interface to the entire script library.

-   **Natural Language Commands:** Simply chat with the agent about what you want to do (e.g., "I need to create a bunch of foundation walls").
-   **Automated Script Discovery:** The agent understands your intent, finds the appropriate script from your library, and presents it to you.
-   **Conversational Parameter-Assistance:** The agent will ask follow-up questions to fill in the script's parameters ("What level should they be on? What wall type?").
-   **User-in-the-Loop:** Before execution, the agent shows you the selected script and the final parameters in the `ScriptInspector` for final review and approval.

## Free vs. Paid Tiers

Paracore operates on a hybrid model, offering powerful core features for free with premium features available for professionals and teams.

-   **Free ("Continue Offline"):**
    -   Full access to the **Manual Automation** mode.
    -   Create, edit, manage, and run unlimited C# scripts.
    -   Full parameter and preset management.
    -   Ideal for individual users or those working in offline environments.

-   **Pro / Enterprise ("Sign in with Google"):**
    -   Includes all free features.
    -   **AI Script Generation**
    -   **Agentic Automation (Paracore Agent)**
    -   **Team Management:** Create teams and manage user roles (`Admin`, `Developer`, `User`).
    -   **Git-Based Collaboration:** Connect team script libraries to shared Git repositories for version control and collaborative development.


## Architecture & Technology

`rap-web` is a single-page application (SPA) that serves as the client-side frontend for the RAP ecosystem.

-   **React & TypeScript:** For a modern, type-safe component-based UI.
-   **Vite:** For fast development builds and bundling.
-   **Tauri:** To package the web app into a lightweight, native desktop executable.
-   **Tailwind CSS:** For utility-first styling.
-   **React Context API:** For clean, decoupled global state management.
-   **Axios:** For communicating with the `rap-server` REST API.

## Development

To run the frontend development server:

```bash
npm install
npm run dev
```

To build the frontend for production:

```bash
npm run build
```

To launch the Tauri desktop application for development:

```bash
npm run tauri dev
```