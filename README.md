# Paracore: Dynamic C# Scripting for Revit 🏗️⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

**Paracore** is a dynamic automation platform designed to simplify Revit API development, providing a streamlined bridge between simple macros and full-scale add-ins. It is built to be **Local-First**, ensuring your data and scripts remain entirely on your machine.

## Overview
Paracore was born from an architect's passion for Revit and a desire to expand the possibilities of design automation. Starting as a personal toolkit to solve everyday design challenges, it has grown into a high-performance execution layer designed to bridge the gap between heavy API development and the dynamic needs of modern automation.

1.  **Safe AI Execution** — AI agents explore and execute C# in Revit through a gRPC sandbox. All model changes require human approval (Sovereign Handoff). The same security layer protects both the in-app agent and MCP clients.
2.  **Zero Boilerplate** — Write a C# script, declare a `Params` class with public properties, and Paracore auto-generates the UI from them. Add attributes like `[Range(0, 100, 1)]` to turn an entry into a slider, or `[Unit("mm")]` for automatic unit conversion. No project files, no compilation — just code and run.

## 🛠️ Build

```powershell
./build-addin.ps1               # Revit add-in
./build-frontend.ps1 -Release   # Desktop app (Tauri + Python sidecar)
./build_extension.sh            # VS Code extension (Git Bash)
```

Requirements: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

## 📚 Developer Resources
- **[Development Guide](DEVELOPMENT.md)** - How to set up and develop Paracore locally (Build, Run, Contribute)
- **[Contributing](CONTRIBUTING.md)** - Guidelines for contributing to the project

## ✨ Why Paracore?
The traditional Revit API development workflow involves several preparatory steps that Paracore simplifies:
- ✅ **Focus on Logic**: Write scripts in VS Code with full IntelliSense, skipping project boilerplate.
- ✅ **Dynamic Execution**: Execute code instantly without manual compilation of binaries.
- ✅ **Automatic UI**: Paracore generates professional-grade parameters UIs (dropdowns, sliders, etc.) automatically from your C# properties.
- ✅ **Rich Features**: Use simple helpers like `Transact()` and access the full power of the Revit API.

## 🤖 AI-Powered Automation

Paracore provides three AI surfaces, all backed by the same gRPC execution engine and safety layer:

**In-App AI Agent** — A conversational agent inside the Paracore desktop app, built on PydanticAI. It explores your Revit model, answers questions, and executes commands — with a human-in-the-loop approval step for any model changes. Bring your own API key (OpenAI, Gemini, DeepSeek, Anthropic, or OpenRouter).

**MCP Server** — The free generalist MCP (`paracore-mcp`) exposes the full Revit API + Paracore DSL to any MCP-compatible client (Claude Desktop, VS Code, Cursor). Start with `Ping`, load the method catalog, then explore and execute. Specialized MCPs for domain-specific tasks are also available as commercial products.

**AI Script Generation** — In VS Code, Copilot and Cline receive custom instructions that teach them the Paracore DSL, parameter engine, and UI conventions. Describe your automation task in natural language and the AI generates a gallery-ready C# script with auto-generated parameter UI.

---

## 📄 License
This project is licensed under the **MIT License**.

## 🤝 Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📞 Contact & Support
- **Documentation**: [paracore-help](https://sey56.github.io/paracore-help/)
- **Email**: codarch46@gmail.com
