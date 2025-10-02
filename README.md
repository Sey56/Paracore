# Revit Automation Platform (RAP)

The Revit Automation Platform (RAP) is a comprehensive ecosystem of tools designed to enable powerful, dynamic C# script execution for automating tasks in Autodesk Revit. It uses a modern, decoupled architecture with a web-based UI and a local execution environment, providing a flexible and user-friendly alternative to traditional in-process Revit add-ins.

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

To enable powerful team collaboration without compromising data privacy or forcing users into a proprietary system, RAP will integrate directly with Git. This approach treats Git as the "source of truth" for script content, while RAP remains the "engine" for execution and management.

This model respects user data by keeping scripts within a user-controlled Git repository (e.g., on GitHub, GitLab, or a private server), not on RAP's servers.

---

#### ✅ What Git Manages (The Source of Truth)

RAP will not reinvent the wheel. It will rely on Git's robust, universally understood features for the core collaboration workflow. Users will manage these aspects using their preferred Git tools (e.g., VS Code's Git lens, GitKraken, or the command line).

*   **Version Control & History:** All script changes, commits, diffs, and historical logs are handled by Git.
*   **Branching & Merging:** Teams can use standard Git workflows like feature branches (`feature/new-script`), bug fixes, and main/develop branches.
*   **Access Control:** Managed entirely by the Git provider (e.g., GitHub/GitLab repository permissions). This ensures only authorized team members can read or write scripts.
*   **Collaboration & Review:** The entire Pull Request (or Merge Request) and code review process happens on the Git provider's platform. This is a mature and well-understood workflow for quality control.
*   **Conflict Resolution:** If merge conflicts occur, users will resolve them using standard Git tools. RAP will not attempt to build a conflict resolution UI.

#### 🧩 What RAP Manages (The Thin Integration Layer)

RAP's role is to provide a seamless and intelligent interface *on top of* the user's Git repository. It makes the Git workflow accessible and convenient from within the RAP application.

*   **Workspace Configuration:**
    *   In RAP, a user will define a "Workspace" that points to a Git repository.
    *   **UI:** The configuration screen will require:
        1.  **Repository URL:** The HTTPS or SSH clone URL.
        2.  **Local Path:** The directory on the user's machine where the repo is or will be cloned.
        3.  **Credentials:** A field for a **Personal Access Token (PAT)**. This is more secure than storing usernames/passwords. The PAT will be stored securely in the operating system's credential manager (e.g., Windows Credential Manager, macOS Keychain).

*   **Automated & Manual Syncing:**
    *   **Initial Clone:** If the local path is empty, RAP will `git clone` the repository.
    *   **Automatic Fetch:** On selecting a workspace, RAP will automatically run `git fetch` to check for remote changes without altering the user's local files.
    *   **Clear UI Indicators:** The UI will clearly display the sync status:
        *   `Up to Date`: Local and remote are in sync.
        *   `Changes to Pull`: The remote has new commits. A "Pull" button will be visible.
        *   `Changes to Push`: The user has local commits not yet on the remote. A "Push" button will be visible.
    *   **User-Driven Actions:** All actions that modify the user's code (`pull`, `push`, `commit`) will be initiated by a button click, not automatically on save, to prevent unexpected changes or conflicts.

*   **In-App Commit Workflow:**
    *   RAP will detect unsaved changes (`git status`).
    *   A "Commit" view will allow the user to:
        1.  See a list of modified/new files.
        2.  Write a commit message.
        3.  Click a "Commit" button, which runs `git add .` and `git commit`. This simplifies the process for users less familiar with the Git CLI.

*   **Contextual Script Information:**
    *   **Enhanced Script Cards:** To provide context, the script card or inspector view will display relevant Git metadata for each script, fetched via `git log`.
        *   **Last Modified By:** The author of the last commit that touched the file.
        *   **Last Commit Message:** The message associated with that commit.
    *   This provides valuable "at-a-glance" context without duplicating the full `git log` history.

---

#### 🛡️ Why This Approach is a Win-Win

*   **Keeps RAP Lean and Focused:** RAP concentrates on its core value proposition: a best-in-class script execution environment for Revit. It avoids becoming a bloated, second-rate Git client.
*   **User Trust and Data Sovereignty:** Users keep their intellectual property in their own repositories. This is the single most important factor for building trust and encouraging adoption in corporate environments.
*   **Leverages Existing Workflows:** Developers and teams don't have to learn a new version control system. They can continue using the tools and platforms they already know and love.
*   **Scalability and Maintainability:** By delegating the complex parts of collaboration to Git, the RAP codebase remains simpler, more maintainable, and easier to scale.

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

In short: The `user` is the **consumer** of the automation. They benefit from the tools without the complexity of creating them.

### 2. The `developer`

**Persona:** This is the Computational Designer, BIM Specialist, VDC Coordinator, or "Power User" on the team. They have an aptitude for logic and scripting and are tasked with creating the automation tools that the users will consume.

**Their Goal:** To build, test, and maintain a robust library of C# scripts that solve real-world project problems. They need a full-featured development environment to be effective.

**Responsibilities & Permissions in RAP:**
*   **Create & Edit Scripts:** They have full access to the script editor and development environment within RAP.
*   **Full Git Workflow:** They can use all the Git integration features: commit, push, pull/sync, and manage workspaces.
*   **Collaboration:** They collaborate with other developers using standard Git practices like branching, merging, and creating Pull Requests on the Git provider's platform (e.g., GitHub, Azure DevOps) for code review.

In short: The `developer` is the **creator** of the automation. They use RAP as an integrated development and execution environment for Revit scripting.

### 3. The `admin`

**Persona:** This is typically the BIM Manager, Design Technology Manager, or a Lead Developer. This person is responsible for the overall health, quality, and governance of the firm's automation ecosystem.

**Their Goal:** To manage the team, ensure script quality, and control which tools are made available to the general user base, providing a stable and reliable experience for everyone.

**Responsibilities & Permissions in RAP:**
*   **All `developer` Permissions:** The admin has all the capabilities of the developer role.
*   **Team Management:** They are responsible for inviting new members, assigning roles (`user`, `developer`, or `admin`), and removing users.
*   **Publishing Scripts (The "Golden" Responsibility):** This is the most critical function. After a script has been tested and reviewed, the admin uses the "Publish" function in RAP. This action marks a specific version of a script as "ready for production use," making it visible and available to all `user` roles. This prevents users from running broken or half-finished scripts.
*   **Gatekeeper of Quality:** The admin acts as the final gatekeeper, ensuring that only high-quality, reliable tools are rolled out to the entire firm.

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