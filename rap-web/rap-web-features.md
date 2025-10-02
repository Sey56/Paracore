# rap-web Features

This document outlines the current features implemented in the `rap-web` application.

## Core Functionality

*   **Script Gallery**: Browse and select C# scripts.
*   **Script Inspection**: View details of selected scripts, including:
    *   **Code Viewer**: Display script source code.
    *   **Parameters Tab**: Dynamically adjust script parameters with various input types (string, number, boolean, enum).
    *   **Console Output**: View execution logs and messages.
    *   **Structured Output Viewer**: Display structured data results from script execution.
    *   **Metadata Viewer**: Inspect script metadata (version, description, categories, etc.).
*   **Script Execution**: Run C# scripts with specified parameters.
*   **Authentication**: Google OAuth integration for user authentication.
*   **Theming**: Toggle between light and dark themes.
*   **Revit Status Monitoring**: Display real-time connection status to the Revit server and Revit application (open/closed, document open/closed, document title, Revit version).
*   **Notification System**: Display success, error, info, and warning notifications to the user.
*   **Responsive Layout**: Adapts UI for mobile and desktop views, including a mobile-specific script inspector.
*   **Script Parameter Presets**: Save, update, rename, and delete custom parameter presets for scripts.

## Refactoring Improvements (Completed)

*   **Centralized API Calls**: Authentication API calls are now centralized in `src/api/auth.ts`.
*   **Modular Parameter Inputs**: Script parameter input rendering is now handled by a dedicated `ParameterInput.tsx` component.
*   **Centralized Authentication State**: User authentication state is managed via `AuthContext`, reducing prop drilling.
*   **Removed Redundant Hook**: The `useApp.ts` hook has been removed, and its functionalities are now directly consumed by relevant components.
*   **Consistent Data Models**: `mockScripts.ts` now aligns with the canonical `Script` and `ScriptParameter` interfaces defined in `src/types/scriptModel.ts`.