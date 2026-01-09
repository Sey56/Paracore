# Paracore Development Guide 🏗️⚡

## 🧠 Philosophy: Why Paracore?
Paracore was built to eliminate the **Infrastructure Overload** of Revit API development. 
Instead of spending time on boilerplate (creating projects, managing manifest files, and DLL orchestration), Paracore allows developers to focus purely on the automation logic.

To achieve this, we architected the system differently:
1.  **Decoupled Engine**: The *Execution Engine* is separate from the *UI*. This enables live execution of C# code without the need for manual project setup.
2.  **Web-First UI**: We use React/TypeScript (via Tauri) to create modern, reactive interfaces that aren't constrained by Revit's legacy tech stack.
3.  **VSCode Integration**: We treat VSCode as a first-class citizen, providing a pre-configured environment where scripts "just run" without manual setup.

As a contributor, you are not just building an add-in; you are building a **Platform** that bridges the gap between Revit and modern software development practices.

---

## 🛠️ Prerequisites
- **Node.js** (v18+)
- **Python** (v3.12+)
- **Revit 2025+** (.NET 8.0 Runtime required)
- **Visual Studio 2022** (for Engine work) or **VSCode** (for Scripting)

## 🏗️ Build Instructions

### 1. Build the Revit Addin 🧱
This compiles `RAP.sln` and generates `Paracore_Revit_Installer.exe` in the `installers` folder.
```powershell
./Paracore-Installer.ps1
```

### 2. Start the Backend Server 🐍
```bash
cd rap-server/server
./.venv/Scripts/activate
uvicorn main:app --reload
```

### 3. Start the Frontend (UI) ⚛️
```bash
cd rap-web
npm run tauri dev
```

### 4. Build the VSCode Extension 🧩
Open **Git Bash** in the Paracore root folder and run:
```bash
./build_extension.sh
```
This will build the extension, copy it to the `installers` folder, and reinstall it in your local VSCode.

### 5. Build Final Release (MSI) 📦
To generate the final `Paracore_Installer.msi` in the `installers` folder:
```powershell
./RAP-installer.ps1 -Release
```

## 🤝 Contributing
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
