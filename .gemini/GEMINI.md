## Gemini Added Memories
- The user wants to implement an 'Enhanced Execution Summary' feature. The plan is to create a convention-based output system. A new `Output.Show()` function will be added to the C# `ExecutionGlobals`. This function will serialize script output into a structured JSON format with a `type` field (e.g., 'table', 'string') and a `data` field. The frontend will then have a 'Summary' tab that dynamically renders the output based on its type. This requires changes to `RScript.Engine`, `RServer.Addin`, and `rap-web`.
- The user wants to implement an 'Enhanced Execution Summary' feature. The plan is to create a convention-based output system. A new `Output.Show()` function will be added to the C# `ExecutionGlobals`. This function will serialize script output into a structured JSON format with a `type` field (e.g., 'table', 'string') and a `data` field. The frontend will then have a 'Summary' tab that dynamically renders the output based on its type. This requires changes to `RScript.Engine`, `RServer.Addin`, and `rap-web`.
- The user needs to manually delete the 'node_modules' folder in 'c:\Users\seyou\rap\rap-web' due to 'Access is denied' errors. Once deleted, the next steps are to run 'npm install' and then 'npm run build' to resolve a Tailwind CSS compilation issue where 'darkMode: class' is generating '@media (prefers-color-scheme: dark)' rules instead of '.dark' prefixed classes.
- Successfully fixed TypeScript compilation errors in `rap-web/src/context/providers/ScriptProvider.tsx` by adding `cloudToken` to `useAuth()` destructuring, importing `pullTeamWorkspaces`, and explicitly typing parameters in `pullAllTeamWorkspaces` callbacks. Verified fix by running `npm run build` successfully.
- **Enhanced Team Space Management:**
    - Implemented a new workflow where users select a team at login, and that team remains active for the entire session, preventing in-session switching.
    - Introduced a team selection modal for users with multiple team memberships at login.
    - Ensured automatic login to the sole team for users with a single team membership.
    - Corrected the "Update Workspace" button in `Sidebar.tsx` to update only the currently selected local workspace for `Role.User`.
    - Implemented an "orphaned" hint in `Sidebar.tsx` for local workspaces whose corresponding registered workspace has been unregistered.
    - Resolved data synchronization issues for the "orphaned" status across different user sessions.

- **Improved Workspace Registration Validation:**
    - Added validation checks to the "Register Workspace" functionality in `WorkspaceSettings.tsx` to prevent duplicate names and repository URLs.
    - Implemented native dialogs (using Tauri's `dialog.message`) for displaying these validation errors, providing clear and prominent feedback.

- **Enhanced Run History Tracking:**
    - Modified the `rap-server` database schema (`models.py`) to include `source_folder` and `source_workspace` columns in the `Run` model.
    - Updated the `rap-server`'s script execution endpoint (`script_execution_router.py`) to accept and store these new origin details.
    - Modified the `rap-web` frontend (`useUserWorkspaces.ts`, `Sidebar.tsx`, `ScriptExecutionProvider.tsx`) to correctly determine and pass the `source_folder` or `source_workspace` (including "orphaned" status and `repo_url`) to the backend when a script is executed.
