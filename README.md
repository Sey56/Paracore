# Paracore: Dynamic C# Scripting for Revit 🏗️⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

**Paracore** is a dynamic automation platform designed to remove the friction from Revit API development, bridging the gap between simple macros and full-scale add-ins.

## 🚀 The Mission
We built Paracore to solve two critical problems:
1.  **Eliminate Boilerplate & Friction**: Traditional add-in development requires complex setup, compiling DLLs, and managing installers. Paracore reduces this to a simple "Type & Run" workflow, ideal for **Rapid Prototyping** and agile development.
2.  **Democratize Automation**: By removing the need for a full software engineering environment, we make powerful C# automation accessible to Architects and Engineers who focus on design, not DevOps.

## 📚 Developer Resources
- **[Development Guide](DEVELOPMENT.md)** - How to set up and develop Paracore locally (Build, Run, Contribute)
- **[Cloud Features](CLOUD_FEATURES.md)** - AI Script Generation & Agentic Automation setup
- **[Contributing](CONTRIBUTING.md)** - Guidelines for contributing to the project

## ✨ Why Paracore?
Traditional Revit API development often involves a heavy "tax" on creativity:
- 🚧 **High Barrier to Entry**: Setting up a full project environment just to test an idea.
- 📦 **Static Deployment**: Compiling and distributing DLLs makes updating tools slow and rigid.
- 📄 **Complex Boilerplate**: Managing `IExternalCommand`, transactions, and manifests for every single command.

**Paracore lets you:**
- ✅ **Focus on Logic**: Write scripts in VS Code with full IntelliSense, skipping the setup.
- ✅ **Dynamic Execution**: Execute code instantly without compiling binaries.
- ✅ **Flexible Deployment**: Share scripts via Git workspaces, allowing teams to sync updates immediately.
- ✅ **Rich Features**: Use simple helpers like `Transact()`, auto-generate UIs, and access full C# power.

## 📊 Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Core Automation** | ✅ Production Ready | Fully functional script execution, parameters, VS Code integration |
| **Team Collaboration** | ✅ Production Ready | User roles, workspaces, Git integration |
| **AI Script Generation** | ⚠️ Proof of Concept | Works with Gemini API, needs refinement |
| **Agentic Automation** | ⚠️ Proof of Concept | LangGraph-based agent, functional but needs development |

> See [CLOUD_FEATURES.md](CLOUD_FEATURES.md) for details on AI and agent features.

---


## Architecture: The Hybrid Model

Paracore is built on a hybrid model that combines the power and security of local execution with the connectivity of cloud services. This architecture is a deliberate choice designed to provide the best possible user experience. 

### Local-First Execution

The core of Paracore runs entirely on the user's local machine, ensuring maximum performance and security. The communication flow is designed for speed and stability:

1.  **Paracore (Desktop App):** The user interacts with the React-based desktop application. When a script is run, the UI sends a standard HTTP request to the local backend.
2.  **rap-server (Local Backend):** This Python server acts as the central middleman. It receives the HTTP request from the UI and translates it into a highly efficient gRPC call.
3.  **Paracore.Addin (Revit Add-in):** The gRPC server running inside Revit receives the call and executes the C# script in-process, with direct access to the Revit API.

### Why This Model is Better

This local-first approach provides three key advantages over a purely cloud-based or a monolithic in-Revit application:

*   **Speed:** All script execution happens locally, with no internet latency. This ensures that automations run as fast as possible, which is critical for a developer tool.
*   **Security & Privacy:** Users' proprietary or sensitive scripts never leave their local machine. This eliminates a major security concern and makes the platform suitable for use in secure corporate environments.
*   **Stability:** Because Paracore is a separate process, any issue or crash in the user interface will not crash the main Revit application, protecting the user from losing their work.

### Cloud-Connected Services

The "hybrid" nature of the platform comes from its connection to a central cloud backend (`rap-auth-server`). While the core script execution is local, the platform uses the cloud for features that require a central source of truth, such as:

*   User Authentication & Identity
*   Team Management & Collaboration
*   Workspace Registration & Access Control
*   Optional AI Features (bring your own API key)

This gives Paracore the best of both worlds: the speed and security of a local desktop application, combined with the connectivity and collaboration features of a cloud platform—**all free and open source forever.**

## Core Components

The platform is composed of several key projects that work together:

*   **Paracore (rap-web)**: The desktop user interface, built with React, TypeScript, and Tauri. This is the main application users interact with for browsing, managing, and running scripts.
    *   [Details](./rap-web/README.md)

*   **rap-server**: A local backend server built with Python and FastAPI. It acts as the bridge between Paracore and the Revit environment, handling API requests and filesystem operations.
    *   [Details](./rap-server/server/README.md)

*   **Paracore.Addin**: A C# Revit add-in that hosts a gRPC server inside Revit. It is responsible for receiving commands and marshalling script execution requests to the main Revit thread, ensuring safe API access.
    *   [Details](./Paracore.Addin/README.md)

*   **CoreScript.Engine**: The core C# scripting engine in `Paracore.Addin` that uses the Roslyn compiler to dynamically compile and execute C# code on-the-fly, manage parameter injection, and provide a rich execution context for scripts.
    *   [Details](./CoreScript.Engine/README.md)

*   **rap-auth-server**: A cloud-based authentication service (Python/FastAPI) that handles user identity, team management, and enables AI features.
    *   [Details](./rap-auth-server/server/README.md)

## Collaboration: A Git-Powered Approach

To enable powerful team collaboration without compromising data privacy or forcing users into a proprietary system, Paracore integrates directly with Git. This approach treats Git as the "source of truth" for script content, while Paracore remains the "engine" for execution and management.

This model respects user data by keeping scripts within a user-controlled Git repository (e.g., on GitHub, GitLab, or a private server), not on Paracore's servers.

### Script Sources & Access

Paracore provides two distinct sources for scripts, tailored to different user needs and roles:

*   **Local Folders (Individual Use):**
    *   Admins have the unique ability to load scripts directly from local folders on their machine **only when they are in their own personal team space**.
    *   This feature is designed for personal experimentation and rapid prototyping without the overhead or complexity of Git operations.
    *   Local folders are not version-controlled and are not visible to anyone else or in any other team space.

*   **Workspaces (Team Collaboration):**
    *   For team collaboration, scripts are sourced exclusively from registered Git repositories (Workspaces) explicitly added by the Admin.
    *   These repositories serve as the central, version-controlled source for all team-approved automation scripts.

### What Git Manages (The Source of Truth - External Git Platform)

Paracore relies on Git's robust, universally understood features for the core collaboration workflow, primarily managed on the external Git hosting platform (GitHub, GitLab, Bitbucket, etc.).

*   **Version Control & History:** All script changes, commits, diffs, and historical logs are handled by Git.
*   **Branching & Merging:** Teams use standard Git workflows like feature branches, bug fixes, and Pull Requests.
*   **Access Control:** Managed entirely by the Git provider (e.g., GitHub/GitLab repository permissions).
*   **Conflict Resolution:** If merge conflicts occur, users will resolve them using standard Git tools.
*   **Protected Branches:** The `main` branch of the repository is configured as "protected" on the Git hosting platform. This prevents direct pushes to `main` and enforces the PR review process.

### What Paracore Manages (The Thin Integration Layer - Convenience within Paracore)

Paracore's role is to provide a seamless and intelligent interface *on top of* the user's Git repository. It makes the Git workflow accessible and convenient from within the Paracore application for common operations, without trying to be a full Git client.

*   **Workspace Registration (Admin Role):** Admins define a "Workspace" by registering a remote Git repository URL. This registration makes the remote URL available to all members of that team.
*   **Workspace Setup (All Team Members):** Team members can "Setup" a registered workspace, which clones the remote repository to a local path on their machine.
*   **Local Clone Management (All Team Members):** Users can "Remove" their local copy of a cloned workspace, deleting the local folder and its record from Paracore.
*   **Branch Management (Admin & Developer Roles):** Display current branch, select/switch branches, and create new branches.
*   **Git Status Indicators (Admin & Developer Roles):** The UI displays the Git status (Up to Date, Ahead, Behind, Uncommitted Changes).
*   **User-Driven Git Actions (Role-Based):**
    *   **Commit (Admin & Developer Roles):** Perform `git add .` and `git commit` to the current local branch.
    *   **Pull (Admin & Developer Roles):** Performs `git pull` to fetch and merge changes.
    *   **Push (Admin & Developer Roles):** Performs `git push` to send local commits.
    *   **Update Scripts (User Role Only):** A simplified button that performs a `git pull` to get the latest versions of scripts from the registered Workspace.

### Git Workflow Enforcement

Paracore implements several features to guide users towards Git best practices and protect the integrity of the `main` branch:

*   **Proactive Branching Reminder (Developer Role):** When a `developer` is on the `main` branch, the `GitStatusPanel` displays a prominent message: "You are on the main branch. Create a branch to commit your changes."
*   **Disabled Commit/Push (Developer Role on `main`):** The "Commit" and "Push" buttons in the `GitStatusPanel` are disabled for `developer`s when the `main` branch is active.
*   **Preventing "main" Branch Creation:** Paracore prevents both `admin`s and `developer`s from creating a new branch named "main".

---

## User Roles & Team Management

The platform is designed around a three-tiered role system that mirrors the structure of a modern AEC firm, ensuring that team members have access to the tools and permissions appropriate for their job function.

### 1. The `user`

**Persona:** This is the largest group of people in the firm. They are the Architects, Engineers, Interior Designers, and Technicians whose primary job is project delivery inside Revit. They are experts in their discipline but are not expected to be programmers.

**Their Goal:** To leverage automation to perform their daily tasks faster, more accurately, and more consistently, without needing to understand the underlying code or version control.

**Responsibilities & Permissions in Paracore:**
*   **Run Scripts:** Their main interaction with Paracore is to find and execute scripts from the Workspaces assigned to them.
*   **Update Scripts:** A simple "Update Scripts" button performs a `git pull` in the background, ensuring they always have the latest versions of the tools from the remote repository.
*   **Read-Only View:** They can view a script's parameters and description but cannot see or edit the C# code. This prevents accidental changes and keeps the interface clean and focused.
*   **No Git Complexity:** The user is completely shielded from Git. They don't see commit history, branches, or push/pull commands.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `user` is the **consumer** of the automation. They benefit from the tools without the complexity of creating them.

### 2. The `developer`

**Persona:** This is the Computational Designer, BIM Specialist, VDC Coordinator, or "Power User" on the team. They have an aptitude for logic and scripting and are tasked with creating the automation tools that the users will consume.

**Their Goal:** To build, test, and maintain a robust library of C# scripts that solve real-world project problems. They need a full-featured development environment to be effective.

**Responsibilities & Permissions in Paracore:**
*   **Create & Edit Scripts:** They have full access to the script editor and development environment within Paracore.
*   **Full Git Workflow:** They can use all the Git integration features: commit, push, pull/sync, and manage workspaces.
*   **Collaboration:** They collaborate with other developers using standard Git practices like branching, merging, and creating Pull Requests on the Git provider's platform (e.g., GitHub, Azure DevOps) for code review.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `developer` is the **creator** of the automation. They use Paracore as an integrated development and execution environment for Revit scripting.

### 3. The `admin`

**Persona:** This is typically the BIM Manager, Design Technology Manager, or a Lead Developer. This person is responsible for the overall health, quality, and governance of the firm's automation ecosystem.

**Their Goal:** To manage the team, ensure script quality, and control which tools are made available to the general user base, providing a stable and reliable experience for everyone.

**Responsibilities & Permissions in Paracore:**
*   **All `developer` Permissions:** The admin has all the capabilities of the developer role.
*   **Team Management:** They are responsible for inviting new members, assigning roles (`user`, `developer`, or `admin`), and removing users.
*   **Workspace Registration:** Can register new team Workspaces.
*   **Registered Workspace Management:** Can delete registered workspaces from the Settings modal.
*   **Publishing & Distribution:** By registering a Workspace, the admin effectively "distributions" scripts to the team. Any script committed and pushed to the repository becomes available to users when they sync.
*   **Gatekeeper of Quality:** The admin controls *which* repositories are registered, ensuring that only trusted sources are available to the team.
*   **Local Clone Management:** Can remove their local copy of a cloned workspace.

In short: The `admin` is the **architect** of the ecosystem. They configure the sources (Workspaces) that feed the team.

This three-tiered structure provides a clear and effective collaboration model that aligns perfectly with the operational needs and skill sets of a modern AEC firm. The detailed implementation plan for how users are created and assigned to teams can be found in the Git Collaboration Plan.

## Future Roadmap

### Parameter System Enhancements

#### Polish Existing Infrastructure
- **Parameter Validation**: Add `Required`, `Min/Max`, `Pattern` attributes for inline validation
- **EnabledWhen Attribute**: Disable parameters conditionally (vs. hiding with `VisibleWhen`)
- **Parameter Units**: Automatic unit conversion and display (e.g., internal mm → display ft)
- **Cascading Dropdowns**: Parameters that depend on other parameter values
- **Large Option Lists**: Search/filter for dropdowns with 100+ items
- **Async Compute**: Loading indicators and cancel buttons for long-running `_Options()` functions
- **Rich Tooltips**: Enhanced help text with examples and formatting
- **Inline Help Links**: Context-sensitive documentation links

#### Additional UI Controls
- **TextArea**: Multi-line text input for notes, JSON, long descriptions
- **Date/Time Picker**: Schedule-based scripts, date range filtering
- **Color Picker**: Material colors, annotation colors, view filters
- **Range Slider**: Dual-handle slider for min/max value selection
- **Radio Buttons**: Alternative to dropdowns for mutually exclusive options
- **Password Input**: Secure input for API keys and credentials
- **Numeric Stepper**: Increment/decrement buttons for number inputs
- **Parameter Icons**: Visual cues for parameter purpose
- **Parameter Search**: Filter parameters in scripts with many inputs

### Testing Infrastructure
- **Unit Tests**: Core engine components (ParameterExtractor, CodeRunner, ParameterOptionsComputer)
- **Integration Tests**: Full stack parameter flow (C# → gRPC → Python → Frontend)
- **UI Tests**: Automated browser tests for parameter controls and interactions
- **Script Tests**: Validation suite for example scripts
- **Edge Case Testing**: Empty documents, large datasets, invalid inputs, circular dependencies
- **Performance Tests**: Large option lists, complex scripts, concurrent executions
- **Regression Tests**: Prevent breaking changes to parameter system

### Community & Marketplace
- **Script Marketplace**: Share and discover automation scripts
- **Script Templates**: Reusable parameter sets and common patterns
- **AI Script Generation**: Enhanced LLM integration for script creation
- **Collaboration Features**: Team script libraries, version control, code review

## Getting Started

To get started with Paracore, see the [Installation Guide](https://sey56.github.io/paracore-help/docs/getting-started/installation).

For VS Code integration, check out the [CoreScript VS Code Extension](https://sey56.github.io/paracore-help/docs/user-guide/corescript-vscode).


---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📞 Contact & Support

- **Documentation**: [sey56.github.io/paracore-help](https://sey56.github.io/paracore-help/)
- **Video Tutorials**: [YouTube @Codarch46](https://www.youtube.com/@Codarch46)
- **Issues**: [GitHub Issues](https://github.com/Sey56/Paracore/issues)
- **Email**: codarch46@gmail.com

> **Note**: If the documentation site is not accessible in your region, use a VPN (Opera browser has a free built-in VPN).

---

*Making Revit automation accessible to the entire AEC industry.*
