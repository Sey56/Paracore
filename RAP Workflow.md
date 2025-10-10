# RAP Workflow: Architecture, Authentication, and Team Management

This document outlines the high-level architecture and user workflow for the Revit Automation Platform (RAP), focusing on how users are authenticated and how team collaboration is managed.

## Core Architecture

RAP is built on a hybrid-cloud model that separates authentication and team management from the core script execution loop. This ensures security and performance. The system consists of four primary components:

1.  **`rap-auth-server` (Cloud Backend):**
    *   A cloud-hosted server (currently on Railway) responsible for user authentication (registration, login) and all team management operations (creating teams, managing memberships, and assigning roles).

2.  **`rap-web` (Frontend):**
    *   A desktop application built with Tauri and React. This is the primary user interface where users manage and execute scripts.

3.  **`rap-server` (Local Backend):**
    *   A local server that runs on the user's machine. It acts as a middleware, translating requests from the `rap-web` frontend into commands for the Revit add-in.

4.  **`RServer.Addin` (Revit Add-in):**
    *   A C# add-in running inside Revit that hosts a gRPC server. It receives and executes script commands directly within the Revit environment, providing full access to the Revit API.

### Communication Flow

-   **`rap-web` <--> `rap-server`:** The frontend and local backend communicate via standard HTTP requests.
-   **`rap-server` <--> `RServer.Addin`:** The local backend and the Revit add-in communicate via high-performance gRPC calls.

---

## User Onboarding and Personal Teams

The user journey begins with a simple, automated onboarding process:

1.  **First Sign-In:** When a user signs into the `rap-web` application for the first time, they are automatically registered with the `rap-auth-server`.
2.  **Personal Team Creation:** Upon successful registration, the `rap-auth-server` creates a dedicated **personal team** for that user (e.g., "John Doe's Space").
3.  **Automatic Admin Role:** The user is automatically assigned the `admin` role for their own personal team. This gives every user full control over their own space from the very beginning.

---

## Team Management and Role Assignment

Collaboration in RAP is centered around teams, which are managed by admins.

### Assembling a Team (Admin's View)

An `admin` can invite other users to their team using the **Team Management** tab within the settings modal:

1.  **Prerequisite:** The user to be invited must already have a RAP account (i.e., they must have signed in at least once).
2.  **Invitation Process:** The admin enters the prospective member's email address and selects a role for them (`admin`, `developer`, or `user`).
3.  **Adding to Team:** Upon clicking "Invite," the user is immediately added to the team with their assigned role.

### Switching Teams (Team Member's View)

Any user who is a member of more than one team can easily switch between them.

-   **Team Switcher:** A dropdown menu is displayed at the top of the Script Gallery, showing all teams the user is a member of, along with their role in each.
-   **Example:**
    -   `John Doe` signs in for the first time and gets his personal team: **"John Doe's Space (admin)"**.
    -   An admin, `Seyoum Hagos`, invites John to his team as a `developer`.
    -   The next time John signs in, his team switcher dropdown will show two options:
        1.  `John Doe's Space (admin)`
        2.  `Seyoum Hagos's Space (developer)`
    -   John can now switch between his personal space (where he is an admin) and Seyoum's team space (where he is a developer).

### Role-Based UI

The `rap-web` user interface is dynamic and adapts to the user's role within the **currently active team**. Features and UI elements are enabled or disabled based on whether the user is an `admin`, `developer`, or `user` in that context, ensuring that team members only have access to the functionalities appropriate for their assigned role.

---

## User Roles and Workflow

RAP defines three distinct roles—`admin`, `developer`, and `user`—to ensure a clear, effective, and safe collaboration workflow. A user's permissions and UI experience are determined by their role in the currently active team.

### Script Sources: A Dual System

RAP provides two sources for scripts, designed for different purposes:

*   **Local Folders (Individual Use):**
    *   Any user can load scripts from a local folder on their machine **only when they are in their own personal team space** (where they are an `admin`).
    *   This is intended for personal experimentation, quick tests, or individual work that is not part of a team project.
    *   Local folders are not version-controlled and are not visible to anyone else or in any other team space.

*   **Workspaces (Team Collaboration):**
    *   For team collaboration, the **single source of truth** is a Git repository, registered as a "Workspace."
    *   All scripts intended for team use must reside in a Workspace.

### Local Cloned Repositories (User-Specific)

Once a team workspace is registered, any team member can create a local clone of it on their machine.

*   **"Setup" Button:** Appears in the sidebar next to a registered workspace that has not yet been cloned by the current user. Clicking it initiates the cloning process to a local folder on the user's machine. This is available to all roles (`admin`, `developer`, `user`).
*   **"Remove" Button (Trash Icon):** Appears in the sidebar next to a workspace that has been locally cloned by the current user. Clicking it deletes the local repository folder from the user's machine and removes its record from the local RAP database. This is available to all roles (`admin`, `developer`, `user`).

### Registered Workspace Management (Admin-Specific)

The management of registered team workspaces is an `admin`-only responsibility.

*   **"Delete" Button:** Located in the "Workspaces" tab of the Settings modal. Only `admin`s can delete a registered workspace. This action removes the workspace from the team's list of registered repositories.

---

### The `admin` Role: Gatekeeper and Manager

The `admin` is responsible for managing the team and curating the script library.

**Responsibilities:**
*   **Team Management:** Invite members and assign roles (`developer`, `user`) via the Team Management settings.
*   **Workspace Registration:** Register new team Workspaces by providing a name and the remote Git repository URL (e.g., from GitHub, GitLab). Once registered, the Workspace appears for all team members with a "Setup" button.
*   **Registered Workspace Management:** Can delete registered workspaces from the Settings modal.
*   **Gatekeeper of Quality:** The admin is responsible for ensuring the quality and stability of the scripts available to the team. This is primarily done by managing the `main` branch of the Git repository.

**Workflow & Permissions:**
*   After setting up a Workspace, the admin sees the `GitStatusPanel` at the bottom of the application, which provides full Git functionality: commit, push, pull, create branches, and switch between branches.
*   **Protected Branches (Best Practice):** It is the admin's responsibility to configure the `main` branch of the team's Git repository as a **protected branch** on the Git provider's platform (e.g., GitHub). This prevents direct pushes to `main` and enforces a Pull Request (PR) review process. This ensures that all changes are reviewed before being made available to the rest of the team, particularly the `user`s.
*   The admin can merge approved PRs from developers outside of RAP.
*   **Direct Commits/Pushes to `main`:** While not best practice, admins are allowed to commit and push directly to the `main` branch if necessary (e.g., for hotfixes, or if the `main` branch is not strictly protected on the Git platform).

### The `developer` Role: Creator and Contributor

The `developer` is responsible for creating, testing, and maintaining the automation scripts.

**Workflow & Permissions:**
*   Like the admin, the developer sees the `GitStatusPanel` after setting up a Workspace and has access to the same Git operations within RAP (commit, push, pull, create/switch branches).
*   Their workflow is to:
    1.  Create a new branch for a feature or bugfix.
    2.  Write and test their script.
    3.  Commit their changes to the new branch.
    4.  Push the branch to the remote repository.
    5.  Go to the Git provider's website (e.g., GitHub) to create a Pull Request to merge their changes into the `main` branch.
*   If the `main` branch is protected (as is the best practice), any attempt by a developer to `push` directly to `main` will be rejected by the remote Git server, and RAP will display the error. This enforces the PR workflow.

### The `user` Role: Consumer of Automation

The `user` (e.g., architect, engineer, designer) is the end-consumer of the scripts. The workflow is designed to be as simple as possible, shielding them from all Git complexity.

**Workflow & Permissions:**
*   **No Code Editing:** Users cannot see or edit script code. They can only interact with the script's parameters, save parameter presets, and run the script.
*   **Initial Setup:** The user clicks the "Setup" button on a Workspace to clone it locally, which populates their Script Gallery.
*   **Simplified UI:**
    *   The `GitStatusPanel` is **never shown** to the `user`.
    *   Instead, a simple **"Update Scripts"** button (a sync/reload icon) appears next to the "Workspaces" title in the sidebar.
*   **Getting Updates:** When a `user` wants the latest approved scripts, they simply click the "Update Scripts" button. In the background, this performs a `git pull` on all their setup workspaces, ensuring they have the latest versions from the `main` branch without ever having to interact with Git directly.

---

## Git Workflow Enforcement

RAP implements several features to guide users towards Git best practices and protect the integrity of the `main` branch:

*   **Proactive Branching Reminder (Developer Role):**
    *   When a `developer` is on the `main` branch, the `GitStatusPanel` displays a prominent message: "You are on the main branch. Create a branch to commit your changes."
    *   This message disappears once the developer checks out or creates a new branch.
*   **Disabled Commit/Push (Developer Role on `main`):**
    *   The "Commit" and "Push" buttons in the `GitStatusPanel` are disabled for `developer`s when the `main` branch is active.
    *   Tooltips explain this restriction, guiding them to create a new branch.
*   **Preventing "main" Branch Creation:**
    *   RAP prevents both `admin`s and `developer`s from creating a new branch named "main", ensuring that "main" remains a unique and protected reference.

---

This refined workflow ensures that admins maintain control, developers can contribute safely, and users get a stable, simple, and powerful automation experience.
