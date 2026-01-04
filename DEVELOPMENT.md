# Paracore Development Guide 🏗️⚡

## 🧠 Philosophy: Why Paracore?
Paracore was built to solve the **Revit API Developer's Crisis** (the slow "Compile & Restart" loop).
To achieve this, we architected the system differently from a standard Revit Add-in:
1.  **Decoupled Engine**: The *Execution Engine* is separate from the *UI*. This allows us to run code dynamically without locking the interface.
2.  **Web-First UI**: We use React/TypeScript (via Tauri) instead of WPF. This allows for modern, reactive interfaces that aren't constrained by Revit's outdated tech stack.
3.  **VSCode Integration**: We treat VSCode as a first-class citizen, allowing developers to use the world's best editor for Revit automation.

As a contributor, you are not just building an add-in; you are building a **Platform** that bridges the gap between Revit and the Modern Web.

---

## 🛠️ Prerequisites
- **Node.js** (v18+)
- **Python** (v3.12+)
- **Revit 2025+** (.NET 8.0 Runtime required)
- **Visual Studio 2022** (for Engine work) or **VSCode** (for Scripting)

## 🏗️ Build Instructions

### 1. Build the Revit Addin
```bash
# Navigate to Addin directory
cd Paracore.Addin
# Build with dotnet
dotnet build -c Release
```

### 2. Start the Frontend (UI)
```bash
# Navigate to web directory
cd rap-web
# Install dependencies
npm install
# Run in dev mode
npm run tauri dev
```

### 3. Start the Backend Server
```bash
# Navigate to server directory
cd rap-server/server
# Create venv
python -m venv venv
# Activate venv
./venv/Scripts/Activate.ps1
# Install requirements
pip install -r requirements.txt
# Run server
uvicorn main:app --reload
```

## 🤝 Contributing
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
