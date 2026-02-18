# Paracore Business Strategy & Roadmap

## 1. Executive Summary
Paracore has evolved from a "Proof of Concept" into a professional-grade Revit automation ecosystem. To ensure long-term sustainability while remaining an Open-Source leader, Paracore will adopt an **"Open Core"** model. We will provide the powerful execution engine for free to the community while charging enterprise firms for management, security, and specialized automation content.

---

## 2. The "Open Core" Model

### Paracore Community (Free)
*Target: Individual Architects, Students, Small Consultants.*
*   **Engine:** Full access to CoreScript.Engine and local execution.
*   **Tools:** Visual Query Builder, VS Code Extension, AI Script Generation.
*   **Limitations:** Local use only; no centralized team management or cross-user reporting.
*   **Goal:** Establish Paracore as the industry standard for Revit scripting.

### Paracore Enterprise (Paid)
*Target: Mid-to-Large Architecture, Engineering, and Construction (AEC) Firms.*
*   **Centralized Watchdog Dashboard:** A web-based "Control Room" for BIM Managers to see the health of all projects across the firm in real-time.
*   **Playlist Cloud-Sync:** Automatically distribute approved script libraries to every designer's machine. No manual installation or Git knowledge required.
*   **Role-Based Access Control (RBAC):** Gated access where junior staff can only run scripts, while senior BIM Coordinators can manage and "Protect" logic.
*   **Priority Support:** Direct access to core developers for custom watchdog creation.

---

## 3. Revenue Streams

### A. The "Marketplace" (Premium Binary Packs)
Sell specialized, high-complexity automation suites as encrypted `.ptool` binaries.
*   **Example Packs:** "Fire Safety Auditor," "Auto-Detailing Suite," "Clash Resolution Wizard."
*   **Benefit:** Firms buy the *result* (a compliant model) without needing to own or manage the *code*.

### B. "BIM-as-a-Service" (Subscription)
Move from selling software to selling a **service**.
*   **Model:** Monthly retainer (e.g., $500 - $1,000/month per firm).
*   **Deliverables:** Continuous updates to the firm's specific Watchdog rules, monthly model health audits, and custom tool development.

---

## 4. Strategy for the Ethiopian Context
Given the challenges with international retail payment gateways (Stripe/PayPal), Paracore will focus on **High-Value Enterprise Contracts**.

*   **Focus on the Big Fish:** Target the top 5–10 construction and architecture firms in Addis Ababa and East Africa.
*   **Invoicing & SWIFT:** Use professional service contracts instead of automated checkouts. Large firms are accustomed to direct bank-to-bank wire transfers (SWIFT).
*   **In-Person Pilots:** Conduct 1-month "Transformation Pilots" locally to prove value before signing annual contracts.

---

## 5. Competitive Edge: Hybrid Security
The most significant selling point for large firms is the **Hybrid Architecture**:
*   **Local Execution:** 100% of the model data stays inside the firm's local network (secure and private).
*   **Cloud Metadata:** The `rap-auth-server` only handles login and tiny "Success/Fail" reports for the dashboard.
*   **Pitch:** *"We offer the power of the cloud with the security of an offline machine."*

---

## 6. Immediate Next Steps
1.  **Release v4.0 Community Edition:** Build the brand and attract contributors.
2.  **Define the "Pro" Tier:** In the existing `SettingsModal`, gate the "Team Sources" and "Dashboard" features behind an Enterprise license check.
3.  **Create the First "Pro-Pack":** Bundle 5 high-value watchdogs into protected binaries to demonstrate the marketplace potential.
4.  **Launch Enterprise Website:** A simple landing page with a "Contact for Enterprise Pricing" button.
