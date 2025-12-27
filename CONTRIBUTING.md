# Contributing to Paracore

Thank you for your interest in contributing to Paracore! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs
- Open an issue on GitHub describing the problem
- Include steps to reproduce
- Mention your Revit version and OS

### Suggesting Features
- Open an issue with the "enhancement" label
- Describe the use case and why it would be valuable
- If possible, provide examples from your workflow

### Submitting Code
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Improving Documentation
- Fix typos or unclear instructions
- Add examples or clarifications
- Update screenshots if UI has changed
- Contribute to the help site at `paracore-help/`

## Development Setup

### Prerequisites
- **Revit 2024 or later** (for testing the add-in)
- **.NET 8 SDK** (for C# projects)
- **Node.js 18+** (for the web UI)
- **Python 3.10+** (for the backend server)
- **Rust** (for Tauri desktop app)

### Building the Projects

**CoreScript.Engine & Paracore.Addin (C#):**
```bash
cd Paracore.Addin
dotnet build
```

**rap-web (React + Tauri):**
```bash
cd rap-web
npm install
npm run tauri dev
```

**rap-server (Python):**
```bash
cd rap-server/server
pip install -r requirements.txt
uvicorn server.main:app --reload
```

## Code Style
- **C#**: Follow standard .NET conventions
- **TypeScript/React**: Use the existing ESLint configuration
- **Python**: Follow PEP 8

## Questions?
- Open a discussion on GitHub
- Email: codarch46@gmail.com
- Documentation: https://sey56.github.io/paracore-help/

## Code of Conduct
Be respectful, constructive, and professional. We're all here to make Revit automation better for the AEC community.

---

**Built by architects, for architects.** 🏗️
