# Autodesk App Store Resubmission Guide (v2.0.0)

This guide provides the necessary content to address the feedback received from the Autodesk App Store team regarding the Paracore submission.

## 1. App Icon Background Recommendation

Autodesk requires a solid background to prevent the icon from blending into their white portal.

### Recommended Colors
*   **Deep Charcoal (`#1A1A1A`)**: *[Recommended]* Our Blue and Orange logo looks extremely sharp and professional against dark gray/black. It gives the app a "Premium Power Tool" feel.
*   **Slate Blue (`#242D3C`)**: A dark, professional blue that complements the "Revit" ecosystem aesthetic while still making our orange facets pop.

> [!TIP]
> When editing in Photoshop, ensure the background fills the entire 120x120 (or larger) square area. Avoid any transparency or white borders.

---

## 2. Draft Response: Custom Installer Justification

You can use the following draft to explain to the Autodesk reviewers why a standard bundle is not sufficient for Paracore.

**Draft Response:**
> "Thank you for the feedback regarding our installers. We have carefully considered the standard bundle format; however, Paracore requires a custom installer (MSI/EXE) for the following technical reasons:
>
> 1. **Multi-Location Installation**: Paracore consists of two primary components that must reside in specific system directories: The Revit Add-in (located in `ProgramData`) and the standalone Desktop Application (located in `Program Files`).
> 2. **Standalone Execution Environment**: The application bundles a Python-based sidecar server (`rap-server`) as a standalone distribution. This server manages the high-performance script execution engine and must be managed as a system process.
> 3. **Process Management**: To ensure a 'Zero-Trace' uninstallation, our custom installers are required to forcefully terminate the Desktop App and Sidecar Server processes to release file locks before cleanup.
> 4. **Administrative Rights**: As requested, we have updated both the Add-in and Desktop installers to strictly require Administrative Privileges (`PrivilegesRequired=admin`) to ensure consistent installation across enterprise Revit environments.
>
> We have verified that the uninstallation logic is robust and removes all binaries and manifests. We have also included clear instructions for the user to manually remove the `%AppData%\paracore-data` folder if they wish to delete all runtime logs and local databases."

---

## 3. Checklist for Resubmission

- [ ] **Icon**: Saved with solid Charcoal or Slate background (No transparency).
- [ ] **Add-in Installer**: Rebuilt with `PrivilegesRequired=admin` and hardened `taskkill` logic.
- [ ] **Desktop Installer**: Rebuilt with the new `cleanup.wxs` fragment.
- [ ] **READ_ME_FIRST.txt**: Contains the manual cleanup instructions for `%AppData%`.
- [ ] **Digital Signature**: (Optional) Mention in the response that the app is currently undergoing internal security verification and will be signed in a future update, but is ready for publishing as-is.
