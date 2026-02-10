# Paracore (rap-web) Refactoring Plan

This plan aims to transform the `rap-web` project into a modular, maintainable, and scalable codebase using a feature-based architecture. This approach decouples features, making them easier to understand, test, and "plug/unplug".

## Principles
- **Screaming Architecture:** The folder structure should reflect what the application does (Features).
- **Decoupling:** Features should minimize dependencies on each other.
- **Single Responsibility:** Each component, hook, and service should have one clear purpose.
- **Consistency:** Use standardized patterns for API calls, state management, and component structure.

---

## Phase 1: Feature-Based Re-organization (Structural Foundation)
**Goal:** Move away from a "flat" structure towards a feature-oriented one.

1.  **Create `src/features` directory.**
2.  **Identify Core Features:**
    - `automation`: Script browsing, execution, playlists, inspector.
    - `agent`: AI-driven automation, chat UI, orchestration.
    - `workspaces`: Managing local and team workspaces.
    - `auth`: User authentication, team selection.
    - `settings`: Application configuration.
3.  **Migration Steps (One by one):**
    - Create folder structure for each feature:
      ```
      src/features/[feature-name]/
      ├── components/
      ├── hooks/
      ├── services/ (API calls)
      ├── store/ (Context/State)
      ├── types/
      └── index.ts (Public API for the feature)
      ```
    - Move relevant files from `src/components`, `src/hooks`, `src/api`, and `src/context` into their respective feature folders.

---

## Phase 2: Decoupling & Logic Extraction
**Goal:** Clean up "Fat" components and global hooks.

1.  **Extract logic from UI components:** Move complex state handling and side effects from components (like `AgentView.tsx`) into feature-specific hooks.
2.  **Modularize `useScripts` & `useScriptExecution`:** Break down these large hooks into smaller, more focused hooks within the `automation` feature.
3.  **Standardize Types:** Ensure feature-specific types are co-located with the feature, while keeping shared types in `src/types`.

---

## Phase 3: State Management & Provider Optimization
**Goal:** Flatten the "Provider Hell" and improve data flow.

1.  **Move Providers:** Move context providers from `src/context/providers` to their respective `src/features/[feature]/store` directories.
2.  **Selective Providing:** Instead of wrapping the entire app in every provider, wrap only the parts of the tree that need them.
3.  **Centralize Global State:** Keep only truly global state (like Theme, Auth) in the root `AppProvider`.

---

## Phase 4: API Layer Refinement
**Goal:** Make API interactions consistent and resilient.

1.  **Unified Axios Instance:** Ensure all services use a consistent base client with proper error handling and interceptors.
2.  **Service Pattern:** Use a consistent service class/object pattern for each feature's API calls.
3.  **React Query (Future Consideration):** Evaluate if moving to a data-fetching library like TanStack Query would simplify state management further.

---

## Phase 5: Modular "Plug-and-Play" Architecture
**Goal:** Enable easy extension and feature toggling.

1.  **Component Abstraction:** Make components more generic and reusable across different contexts.
2.  **Registry Pattern:** Implement a way to register "tools" or "script types" so the UI can dynamically adapt without hardcoding.
3.  **Lazy Loading:** Implement code-splitting at the feature level to improve performance.

---

## Implementation Strategy (To Avoid Interruptions)
Each step will be implemented as an atomic change. We will ensure the project builds and runs after every single file move or refactor.

1.  **Preparation:** Audit all current imports.
2.  **Step-by-Step Migration:** Move one feature at a time, updating imports along the way.
3.  **Verification:** Run `npm run build` and manual smoke tests after each feature migration.
