# Day 01 — Install and First Run

This episode shows how to install and set up Paracore, then run your first script.

---

## Installation
1. Download the installers from the [Paracore Releases page](https://github.com/Sey56/Paracore-Scripts/releases/latest):
   - **A. Paracore_Installer.msi** → Main Paracore application
   - **B. Paracore_Revit_Installer.exe** → Revit add-in (required)
   - **C. corescript-0.0.1.vsix** → VSCode extension (optional)

2. Install **Paracore_Revit_Installer.exe** → Open Revit → Toggle RServer ON.  
3. Install **Paracore_Installer.msi** → Launch Paracore (auto-connects to Revit).  
4. Clone or download the [Paracore-Scripts repo](https://github.com/Sey56/Paracore-Scripts).

---

## First Run
- In Paracore app, sign in by clicking the **“Continue Offline”** button.  
- In the Sidebar, load the `Paracore-Scripts` folder.  
- Verify that scripts are populated in the **ScriptGallery**. Select one and view its details in the **ScriptInspector**.  
- Make sure you have an empty Revit project open.  
- Run the `Create_Wall.cs` script.  
- ✅ If the script created a wall in Revit, you have successfully set up Paracore.

---

## Video
▶ [Watch on YouTube]https://youtu.be/_E6QmXQl3WE