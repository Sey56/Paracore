# rap-web - Revit Automation Platform (RAP) Frontend (Public-facing product name: Paracore)

`rap-web` (public-facing name: Paracore) is the primary user interface for the Revit Automation Platform (RAP), an ecosystem that also includes a lightweight extension for direct script execution from VSCode. Paracore is a modern, responsive desktop application built with React and TypeScript, and packaged as a native application using Tauri. It provides a rich and intuitive environment for users to browse, manage, inspect, and execute Revit automation scripts.

## Core Features

-   **Script Gallery:**
    -   **Folder-Based Management:** Users can add multiple local folders where their scripts are stored.
    -   **Rich Filtering and Sorting:** Easily search scripts by name, description, or tags. Sort scripts by name or last run date.
    -   **Categorization:** View scripts grouped by favorites, categories defined in the script metadata, or by folder.

-   **Script Inspector:**
    -   **Parameter Editing:** When a script is selected, its parameters are automatically parsed and displayed in a user-friendly form, allowing for easy editing before execution.
    -   **Parameter Presets:** Save and load different sets of parameter values as named presets, streamlining repeated workflows.
    -   **Code Viewer:** Inspect the full source code of the selected script in a read-only view using `react-syntax-highlighter`.

-   **Execution and Output:**

    -   **Run Scripts:** Execute scripts in Revit with a single click, sending the user-defined parameters to the execution engine.
    -   **Console Output:** View real-time print messages and error logs from the script execution in a dedicated console tab.
    -   **Structured Summary:** A dedicated "Summary" tab renders structured data (e.g., tables, lists, or other objects) returned from the script, providing a much richer output than plain text.

-   **Integrated VSCode Editing:**
    -   **Ephemeral Workspaces:** Instead of building a custom editor, RAP leverages the power of VSCode. Clicking "Edit Script" dynamically creates a temporary, ephemeral workspace on disk.
    -   **IntelliSense Ready:** This workspace is automatically scaffolded with a `.csproj` file containing all necessary references to the Revit API and `CoreScript.Engine`, providing full IntelliSense and code completion in VSCode.
    -   **Live Sync:** The original script files are copied to the workspace, and a `FileSystemWatcher` is initiated. Any saves made in the VSCode workspace are automatically and instantly synced back to the original script files.
    -   **Automatic Cleanup:** The temporary workspace folders are automatically deleted when Revit is closed.

    -   **Git Integration:** Users can clone scripts from Git repositories, work on them locally, and commit/sync changes to the remote repository directly from within RAP-Web.
-   **Authentication:**
    -   **Google OAuth:** Implements user authentication using Google OAuth, handled by the `@react-oauth/google` library.

-   **Desktop Experience:**
    -   **Native Application:** Packaged with Tauri, it runs as a lightweight, native desktop application on Windows.
    -   **Local File Access:** Interacts directly with the `rap-server` backend to access local script files and folders.
    -   **Notifications:** Provides system notifications for key events like script execution success or failure.

## Architecture

`rap-web` is a single-page application (SPA) that serves as the client-side frontend for the RAP ecosystem.

### Technology Stack

-   **React:** For building the component-based user interface.
-   **TypeScript:** For type-safe development.
-   **Vite:** As the fast build tool and development server.
-   **Tailwind CSS:** For utility-first styling and rapid UI development.
-   **Tauri:** For packaging the web application into a native desktop executable.
-   **FontAwesome:** For icons.

### Component Structure

The `src/components` directory is organized by feature, promoting modularity and maintainability:
-   **`automation`**: Components related to script management and execution.
-   **`common`**: Reusable components like buttons, modals, and inputs.
-   **`layout`**: Main application structure, including the sidebar and header.
-   **`settings`**: Components for the application settings page.

### State Management

The application uses a modular state management approach based on **React's Context API**. Global state is divided into logical, feature-based providers (e.g., `ScriptProvider`, `ScriptExecutionProvider`, `UIProvider`), which are combined in a central `AppProvider`. This keeps state management clean, decoupled, and easy to maintain.

### API Interaction

All communication with the local backend is handled via the `rap-server` API. A pre-configured `axios` instance (`rapApiClient` in `src/api/axios.ts`) makes HTTP requests to the FastAPI backend (running on `http://localhost:8000`). The API layer is organized by resource:
-   **`scripts.ts`**: Functions for script management and execution.
-   **`workspaces.ts`**: Functions for working with Git repositories in RAP-Web (cloning, committing, syncing).

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

## The Paracore Agent: Conversational AI for Revit Automation

Building on the powerful script execution engine, Paracore now features the **Paracore Agent**, a conversational AI assistant that brings natural language automation to Revit.

The agent provides a chat-based interface where users can describe the task they want to perform. The agent leverages the entire RAP ecosystem to:

1.  **Understand User Intent:** Parses natural language to determine the user's goal.
2.  **Discover Relevant Scripts:** Searches the existing script library to find the right tool for the job.
3.  **Extract Parameters:** Identifies and extracts necessary parameters from the conversation (e.g., "a wall 30 feet long").
4.  **Confirm and Execute:** Presents the chosen script and parameters to the user for approval via the `ScriptInspector` before running the automation in Revit.

This feature makes Revit automation more accessible than ever, allowing users to perform complex tasks without needing to find and configure scripts manually.