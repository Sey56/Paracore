# Revit Automation Platform (RAP)

The Revit Automation Platform (RAP or just Paracore) is a comprehensive ecosystem of tools designed to enable powerful, dynamic C# script execution for automating tasks in Autodesk Revit. It uses a modern, decoupled architecture with a web-based UI and a local execution environment, providing a flexible and user-friendly alternative to traditional in-process Revit add-ins.

## Architecture: The Hybrid Model

RAP is built on a hybrid model that combines the power and security of local execution with the connectivity of cloud services. This architecture is a deliberate choice designed to provide the best possible user experience. 

### Local-First Execution

The core of RAP runs entirely on the user's local machine, ensuring maximum performance and security. The communication flow is designed for speed and stability:

1.  **`rap-web` (Desktop App):** The user interacts with the React-based desktop application. When a script is run, the UI sends a standard HTTP request to the local backend.
2.  **`rap-server` (Local Backend):** This Python server acts as the central middleman. It receives the HTTP request from the UI and translates it into a highly efficient gRPC call.
3.  **`RServer.Addin` (Revit Add-in):** The gRPC server running inside Revit receives the call and executes the C# script in-process, with direct access to the Revit API.

### Why This Model is Better

This local-first approach provides three key advantages over a purely cloud-based or a monolithic in-Revit application:

*   **Speed:** All script execution happens locally, with no internet latency. This ensures that automations run as fast as possible, which is critical for a developer tool.
*   **Security & Privacy:** Users' proprietary or sensitive scripts never leave their local machine. This eliminates a major security concern and makes the platform suitable for use in secure corporate environments.
*   **Stability:** Because the UI (`rap-web`) is a separate process, any issue or crash in the user interface will not crash the main Revit application, protecting the user from losing their work.

### Cloud-Connected Services

The "hybrid" nature of the platform comes from its connection to a central cloud backend (`rap-auth-server`). While the core script execution is local, the platform uses the cloud for features that require a central source of truth, such as:

*   User Authentication & Identity
*   Licensing and Payments for future premium features
*   Value-add services like AI Script Generation or a community Script Marketplace

This gives RAP the best of both worlds: the speed and security of a local desktop application, combined with the connectivity and commercial possibilities of a SaaS platform.

## Core Components

The platform is composed of several key projects that work together:

*   **`rap-web`**: The frontend user interface, built as a native desktop application using React, TypeScript, and Tauri. It provides the environment for browsing, managing, and running scripts.
    *   [Details](./rap-web/README.md)

*   **`rap-server`**: A local backend server built with Python and FastAPI. It acts as the bridge between the web UI and the Revit environment, handling API requests and filesystem operations.
    *   [Details](./rap-server/server/README.md)

*   **`RServer.Addin`**: A C# Revit add-in that hosts a gRPC server inside Revit. It is responsible for receiving commands and marshalling script execution requests to the main Revit thread, ensuring safe API access.
    *   [Details](./RServer.Addin/README.md)

*   **`RScript.Engine`**: The core C# scripting engine in `RServer.Addin` that uses the Roslyn compiler to dynamically compile and execute C# code on-the-fly, manage parameter injection, and provide a rich execution context for scripts.
    *   [Details](./RScript.Engine/README.md)

*   **`rap-auth-server`**: A planned cloud-based authentication service (Python/FastAPI) that will handle user identity, licensing, and other commercial features in the future.
    *   [Details](./rap-auth-server/server/README.md)

## Collaboration: A Git-Powered Approach

To enable powerful team collaboration without compromising data privacy or forcing users into a proprietary system, RAP integrates directly with Git. This approach treats Git as the "source of truth" for script content, while RAP remains the "engine" for execution and management.

This model respects user data by keeping scripts within a user-controlled Git repository (e.g., on GitHub, GitLab, or a private server), not on RAP's servers.

### Script Sources & Access

RAP provides two distinct sources for scripts, tailored to different user needs and roles:

*   **Local Folders (Individual Use):**
    *   Admins have the unique ability to load scripts directly from local folders on their machine **only when they are in their own personal team space**.
    *   This feature is designed for personal experimentation and rapid prototyping without the overhead or complexity of Git operations.
    *   Local folders are not version-controlled and are not visible to anyone else or in any other team space.

*   **Workspaces (Team Collaboration):**
    *   For team collaboration, scripts are sourced exclusively from registered Git repositories (Workspaces).
    *   These repositories serve as the central, version-controlled source for all team-approved automation scripts.

### What Git Manages (The Source of Truth - External Git Platform)

RAP relies on Git's robust, universally understood features for the core collaboration workflow, primarily managed on the external Git hosting platform (GitHub, GitLab, Bitbucket, etc.).

*   **Version Control & History:** All script changes, commits, diffs, and historical logs are handled by Git.
*   **Branching & Merging:** Teams use standard Git workflows like feature branches, bug fixes, and Pull Requests.
*   **Access Control:** Managed entirely by the Git provider (e.g., GitHub/GitLab repository permissions).
*   **Conflict Resolution:** If merge conflicts occur, users will resolve them using standard Git tools.
*   **Protected Branches:** The `main` branch of the repository is configured as "protected" on the Git hosting platform. This prevents direct pushes to `main` and enforces the PR review process.

### What RAP Manages (The Thin Integration Layer - Convenience within RAP)

RAP's role is to provide a seamless and intelligent interface *on top of* the user's Git repository. It makes the Git workflow accessible and convenient from within the RAP application for common operations, without trying to be a full Git client.

*   **Workspace Registration (Admin Role):** Admins define a "Workspace" by registering a remote Git repository URL. This registration makes the remote URL available to all members of that team.
*   **Workspace Setup (All Team Members):** Team members can "Setup" a registered workspace, which clones the remote repository to a local path on their machine.
*   **Local Clone Management (All Team Members):** Users can "Remove" their local copy of a cloned workspace, deleting the local folder and its record from RAP.
*   **Branch Management (Admin & Developer Roles):** Display current branch, select/switch branches, and create new branches.
*   **Git Status Indicators (Admin & Developer Roles):** The UI displays the Git status (Up to Date, Ahead, Behind, Uncommitted Changes).
*   **User-Driven Git Actions (Role-Based):**
    *   **Commit (Admin & Developer Roles):** Perform `git add .` and `git commit` to the current local branch.
    *   **Pull (Admin & Developer Roles):** Performs `git pull` to fetch and merge changes.
    *   **Push (Admin & Developer Roles):** Performs `git push` to send local commits.
    *   **Update Scripts (User Role Only):** A simplified button that performs a `git pull` to get the latest versions of published scripts.

### Git Workflow Enforcement

RAP implements several features to guide users towards Git best practices and protect the integrity of the `main` branch:

*   **Proactive Branching Reminder (Developer Role):** When a `developer` is on the `main` branch, the `GitStatusPanel` displays a prominent message: "You are on the main branch. Create a branch to commit your changes."
*   **Disabled Commit/Push (Developer Role on `main`):** The "Commit" and "Push" buttons in the `GitStatusPanel` are disabled for `developer`s when the `main` branch is active.
*   **Preventing "main" Branch Creation:** RAP prevents both `admin`s and `developer`s from creating a new branch named "main".

---

## User Roles & Team Management

The platform is designed around a three-tiered role system that mirrors the structure of a modern AEC firm, ensuring that team members have access to the tools and permissions appropriate for their job function.

### 1. The `user`

**Persona:** This is the largest group of people in the firm. They are the Architects, Engineers, Interior Designers, and Technicians whose primary job is project delivery inside Revit. They are experts in their discipline but are not expected to be programmers.

**Their Goal:** To leverage automation to perform their daily tasks faster, more accurately, and more consistently, without needing to understand the underlying code or version control.

**Responsibilities & Permissions in RAP:**
*   **Run Scripts:** Their main interaction with RAP is to find and execute pre-approved, "published" scripts.
*   **Update Scripts:** A simple "Update Scripts" button performs a `git pull` in the background, ensuring they always have the latest versions of the tools published by the admin.
*   **Read-Only View:** They can view a script's parameters and description but cannot see or edit the C# code. This prevents accidental changes and keeps the interface clean and focused.
*   **No Git Complexity:** The user is completely shielded from Git. They don't see commit history, branches, or push/pull commands.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `user` is the **consumer** of the automation. They benefit from the tools without the complexity of creating them.

### 2. The `developer`

**Persona:** This is the Computational Designer, BIM Specialist, VDC Coordinator, or "Power User" on the team. They have an aptitude for logic and scripting and are tasked with creating the automation tools that the users will consume.

**Their Goal:** To build, test, and maintain a robust library of C# scripts that solve real-world project problems. They need a full-featured development environment to be effective.

**Responsibilities & Permissions in RAP:**
*   **Create & Edit Scripts:** They have full access to the script editor and development environment within RAP.
*   **Full Git Workflow:** They can use all the Git integration features: commit, push, pull/sync, and manage workspaces.
*   **Collaboration:** They collaborate with other developers using standard Git practices like branching, merging, and creating Pull Requests on the Git provider's platform (e.g., GitHub, Azure DevOps) for code review.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `developer` is the **creator** of the automation. They use RAP as an integrated development and execution environment for Revit scripting.

### 3. The `admin`

**Persona:** This is typically the BIM Manager, Design Technology Manager, or a Lead Developer. This person is responsible for the overall health, quality, and governance of the firm's automation ecosystem.

**Their Goal:** To manage the team, ensure script quality, and control which tools are made available to the general user base, providing a stable and reliable experience for everyone.

**Responsibilities & Permissions in RAP:**
*   **All `developer` Permissions:** The admin has all the capabilities of the developer role.
*   **Team Management:** They are responsible for inviting new members, assigning roles (`user`, `developer`, or `admin`), and removing users.
*   **Workspace Registration:** Can register new team Workspaces.
*   **Registered Workspace Management:** Can delete registered workspaces from the Settings modal.
*   **Publishing Scripts (The "Golden" Responsibility):** This is the most critical function. After a script has been tested and reviewed, the admin uses the "Publish" function in RAP. This action marks a specific version of a script as "ready for production use," making it visible and available to all `user` roles.
*   **Gatekeeper of Quality:** The admin acts as the final gatekeeper, ensuring that only high-quality, reliable tools are rolled out to the entire firm.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `admin` is the **manager and curator** of the automation ecosystem. They control team access and are responsible for the final "stamp of approval" on scripts.

This three-tiered structure provides a clear and effective collaboration model that aligns perfectly with the operational needs and skill sets of a modern AEC firm. The detailed implementation plan for how users are created and assigned to teams can be found in the Git Collaboration Plan.

### `rap-web` Folder and File Organization Assessment

Based on a recursive analysis of the `src` directory and its subdirectories, the `rap-web` project demonstrates a **clear, modular, usable, and scalable** folder and file organization.

**Clarity:**
*   **Descriptive Naming:** Folder and file names are highly descriptive (e.g., `components/automation/ScriptCard`, `hooks/useScriptExecution`, `api/rapApiClient`), making it easy to understand their purpose.
*   **Separation of Concerns:** Different types of code (components, hooks, API logic, contexts, types, utilities, styles) are placed in distinct, top-level directories within `src`, preventing clutter and aiding in locating functionalities.
*   **Component-Specific Organization:** Within `components`, related files (e.g., `ScriptCard.tsx` and `ScriptCard.module.css`) are co-located in their own directories, a common and effective pattern for component-based architectures.

**Modularity:**
*   **Component-Based Architecture:** Extensive use of a `components` directory, further subdivided by feature (`automation`, `common`, `layout`), promotes reusability and easier management of UI elements.
*   **Custom Hooks:** The `hooks` directory effectively encapsulates reusable logic and stateful behavior, reducing code duplication and improving component maintainability.
*   **Context API for Global State:** The `context` directory, with its `providers` subdirectory, provides a well-structured approach to managing global state, with each context being a self-contained unit.
*   **API Layer:** The `api` directory clearly separates the UI from the backend API, facilitating easier API modifications.
*   **Type Definitions:** The `types` directory centralizes all type definitions, crucial for type safety and consistency in a TypeScript project.

**Usability:**
*   **Developer Experience:** The clear and consistent organization significantly improves the developer experience, allowing new developers to quickly understand the codebase.
*   **Maintainability:** The modular design makes the codebase easier to maintain, as changes to one part are less likely to impact others.
*   **Debugging:** Logical grouping of files aids in debugging by narrowing down the search for problematic code.

**Scalability:**
*   **Feature-Based Grouping:** Features can be logically grouped (e.g., `components/automation`), allowing for easy addition of new features without disrupting the existing structure.
*   **Reusable Abstractions:** Custom hooks and context providers are highly reusable, reducing development time and ensuring consistency as the application scales.
*   **Clear Boundaries:** Well-defined boundaries between different parts of the application facilitate scaling development teams.
*   **Type Safety:** TypeScript's strong typing and the centralized `types` directory are invaluable for large, scalable applications, catching errors early and ensuring data consistency.

In summary, the `rap-web` project exhibits a thoughtful and well-executed approach to folder and file organization, adhering to modern best practices for front-end development. This structure will undoubtedly contribute to the project's long-term success in terms of development efficiency, maintainability, and adaptability to future changes and growth.
