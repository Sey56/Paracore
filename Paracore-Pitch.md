# Paracore – The BIM Tool Factory & Performance Automation Engine

**Presented by:**  
Seyoum Hagos – Co-Founder  
Hagos Aman – Co-Founder  

**Location:** Lemi Kura Sub‑city, Abuki Building, Office 414, Addis Ababa, Ethiopia  

---

## 1. Vision & Mission

### 1.1 Vision  
To digitally transform Ethiopia’s construction industry by enabling intelligent, data‑driven, and automated design and construction workflows.

### 1.2 Mission  
To develop accessible BIM automation tools, AI‑powered systems, and cloud‑based platforms that empower architects, engineers, and contractors to deliver efficient, high‑quality, and sustainable projects.

### 1.3 Innovation Identity  
*Paracore – BIM Tool Factory & Performance Automation Engine*  
Innovators: Seyoum Hagos & Hagos Aman | Year: 2025

---

## 2. Problem: The Automation Gap in BIM

### 2.1 Industry‑Level Challenges  
- Low BIM adoption in Ethiopia – most firms still rely on 2D workflows.  
- Poor coordination between disciplines leads to costly clashes discovered late.  
- High construction errors and cost overruns – rework accounts for 5–15% of project costs.  
- Limited access to digital AEC tools – high cost of international software; no local alternatives.

### 2.2 The Deeper Problem: Existing Automation Tools Fall Short

| Tool | Limitation |
|------|------------|
| Traditional Add‑in Development | Requires C#, Visual Studio, Revit API expertise – weeks to build even simple tools. |
| Dynamo | Visual graphs become unmanageable for complex logic; break with Revit updates; poor debugging; performance issues at scale. |
| pyRevit / RevitPythonShell | Limited by Python’s Revit API bindings; no native UI generation; manual script management; no background execution. |
| Rhino.Inside.Revit | Heavy dependency; steep learning curve; primarily geometry‑focused, not workflow automation. |

### 2.3 The Real Cost: Two Tiers of Exclusion  

**For Non‑Coders** (architects, engineers, BIM coordinators)  
- Automation feels inaccessible – “I need to learn programming just to save time?”  
- Simple requests like “find all walls shorter than 2 meters” require developer intervention.  
- Valuable ideas for workflow improvements never get implemented.

**For Developers** (BIM managers, power users)  
- Revit API has a steep learning curve (700+ classes, complex object models).  
- Traditional add‑in development requires: Visual Studio setup, Revit SDK, debugging across processes, deployment headaches.  
- Even simple tools take hours to build, test, and distribute.  
- No ability to run quick experiments or inspect live data.

### 2.4 The Vision Gap  
What’s missing is a bridge – an ecosystem that:  
- Empowers non‑coders to create automation through natural language (AI) and visual tools.  
- Empowers developers with instant execution, live data inspection, and rapid tool creation.  
- Works together – scripts created by developers become reusable tools for non‑coders.  
- Monitors live – not just one‑time checks, but continuous background quality control.

---

## 3. Solution: Paracore – The BIM Tool Factory & Performance Automation Engine

**“We digitize and automate design and construction workflows.”**

Paracore is a complete ecosystem that closes the automation gap. It provides:  
- **Real‑time BIM quality monitoring** – background “Sentinels” that run continuously and report violations.  
- **Instant tool creation** – no coding barrier; scripts become professional tools with automatically generated UI.  
- **AI‑assisted automation** – natural language descriptions generate fully working scripts.  
- **Live data interaction** – edit thousands of element properties directly from dynamic tables inside Revit.

---

## 4. Technology Overview

Paracore consists of three integrated components:  
1. **Paracore.Addin** – A Revit add‑in that hosts a gRPC server inside Revit.  
2. **rap‑server** – A local FastAPI sidecar that translates between gRPC (Revit) and HTTP (UI).  
3. **rap‑web** – A desktop application built with React, TypeScript, and Tauri, providing the user interface.

### 4.1 Key Technical Capabilities  

| Feature | Description |
|---------|-------------|
| **BIM Tool Factory** | Turn any script into a reusable tool with automatic parameter UI – no coding required. |
| **Visual Query Builder** | Build complex element filters through a graphical interface; generate code automatically. |
| **Sentinels** | Background scripts that continuously monitor the model and report compliance breaches in real time. |
| **Active Data Grid** | Editable tables that allow live editing of element parameters; mass‑edit via spreadsheet import/export. |
| **REPL (Read‑Eval‑Print Loop)** | Interactive C# console inside Revit for instant experimentation: `GetElements<Wall>().Count`, multi‑line queries, dynamic tables. |
| **AI Integration** | Scaffolding includes AI instructions; an LLM can generate Paracore‑compliant code from natural language descriptions. |
| **Institutional Memory** | Central knowledge system for sharing scripts, best practices, and automation across teams. |

### 4.2 How It Works for Different Users  

- **Non‑coders** → Use AI generation or Visual Query Builder to create tools; run them with one click; no code touched.  
- **Developers** → Write C# scripts in VS Code with full IntelliSense; scripts become tools with auto‑generated UI.  
- **BIM Managers** → Deploy Sentinels to monitor model quality continuously; receive live alerts on compliance breaches.

---

## 5. Products & Services

### 5.1 Core Platform Features  
1. **BIM Tool Factory** – Instant conversion of scripts to tools.  
2. **Visual Query Builder** – No‑code model filtering and code generation.  
3. **Quality at the Source (Sentinels)** – Real‑time error detection and reporting.  
4. **Active Data Grid** – Live editing of BIM data; mass updates.  
5. **Institutional Memory** – Central repository for automation assets.  
6. **Advanced REPL (Peek)** – Live debugging, inspection, and experimentation.

### 5.2 Business Offerings  
- **BIM Modeling & Coordination** – Consulting services for projects.  
- **AEC Software Development** – Custom tools and integrations.  
- **Training & Certification Programs** – Structured courses for professionals.  
- **Digital Twin & Data Analytics** – Advanced services for smart construction.

---

## 6. Implementation Areas

**Government Institutions**  
- Construction and Management Institute (CMI)  
- Ministry of Urban Development and Construction (MUDC)  
- Ethiopian Engineering Corporation (EEC)  
- Ethiopian Construction Works Corporation (ECWC)  
- Engineering Corporation of Oromia (ECO)  
- Oromia Construction Corporation (OCC)

**Construction Companies**  
- Alpha Post Tension  
- Seven S ET – Advanced General Contractor

**Real Estate Developers**  
- GIFT  
- OVID

**Architectural and Engineering Consulting Firms**  
- BIGAR  
- ZIAS

**Universities**  
- AAiT, ASTU, AASTU

**Suppliers** – Materials and equipment providers

---

## 7. Industry Benefits

| Indicator | Traditional Approach | Paracore Advantage |
|-----------|----------------------|--------------------|
| Quality | Late detection, costly rework | Real‑time monitoring, preventive alerts |
| Cost | High rework costs | Preventive system reduces waste |
| Time | Project delays | Faster delivery through automation |
| Productivity | Manual, repetitive tasks | AI‑assisted and scripted workflows |
| Jobs | BIM operators | “BIM Tool Smiths” – creators, not just users |
| Foreign Exchange | Imported software tools | Locally developed, sustainable ecosystem |

---

## 8. Market Opportunity

### 8.1 Ethiopia Context  
- **Rapid urbanization** – Cities like Addis Ababa expand quickly, driving demand for efficient planning.  
- **Booming construction sector** – Large‑scale investments in housing, infrastructure, and commercial developments.  
- **Government push for digitalization** – National initiatives promoting e‑governance, smart cities, and digital transformation.

### 8.2 Target Market Segments  
- **Government Mega Projects** – Smart cities, transport infrastructure, public housing.  
- **Real Estate Developers** – Mixed‑use, residential, and commercial projects.  
- **NGOs & International Consultants** – Donor‑funded projects requiring BIM compliance and transparent reporting.

### 8.3 Market Gap & Opportunity  
- **Low BIM penetration** in Ethiopia → First‑mover advantage.  
- **Limited local expertise** → High demand for training and tools.  
- **Inefficiencies in traditional workflows** → Strong ROI for digital solutions.

### 8.4 Strategic Positioning  
Paras Codarch (the company behind Paracore) is positioned to become:  
- A **BIM technology leader in Ethiopia**.  
- A **bridge between global AEC innovation and local market needs**.  
- A **capacity builder** for the next generation of digital construction professionals.

---

## 9. Business Model

Paras Codarch operates a hybrid revenue model combining consulting, SaaS, and capacity building – ensuring both short‑term cash flow and long‑term recurring revenue.

### 9.1 Revenue Streams  

| Stream | Description | Revenue Type |
|--------|-------------|--------------|
| Consultancy Services | BIM implementation, digital transformation advisory, BIM execution planning | Project‑based (high value) |
| SaaS Licensing | Subscription‑based Revit add‑ins (SH_Tools, SynCad, OffsetMax); cloud‑based BIM tools | Monthly / annual subscriptions |
| Training & Certification | BIM certification courses, intensive bootcamps, corporate training packages | Per trainee / institutional contracts |
| Custom Software Development | Tailored BIM tools, AI‑driven automation, system integrations | Project‑based + maintenance |

### 9.2 Revenue Mix Strategy (3–5 Year Vision)  
- **Year 1–2:** Focus on consultancy + training – cash flow generation.  
- **Year 3–5:** Scale SaaS licensing – dominant revenue stream.  
- **Long‑Term Goal:** Transition into a product‑driven company with recurring revenue.

### 9.3 Business Model Strengths  
- Diversified revenue streams → reduced risk.  
- Recurring SaaS income → predictable cash flow.  
- Strong synergy between training → tools → consulting.  
- High scalability through digital products.

---

## 10. Competitive Advantage  

- **First‑mover** in Ethiopia BIM automation.  
- **Deep AEC + AI integration** – native Revit API access with AI assistance.  
- **Locally developed solutions** – tailored to Ethiopian context.  
- **Highly customizable platform** – open source core, proprietary services.  
- **Strong domain expertise** – co‑founders are architects with deep Revit knowledge.

---

## 11. Cost & Sustainability Strategy  

- **Low capital requirement** – software‑driven; leverages open‑source core.  
- **Revenue streams** – automation packs, training programs, enterprise solutions.  
- **Reduces dependency** on foreign software – supports national digital sovereignty.

---

## 12. Technology & Innovation  

- **BIM platforms** – Revit, Navisworks.  
- **AI‑driven automation** – natural language to code.  
- **Cloud collaboration systems** – future roadmap.  
- **Real‑time data analytics** – sentinel reports, live tables.

---

## 13. Traction  

### 13.1 Product Development & Innovation  
- Successfully developed proprietary BIM tools: **SH_Tools, RAssistant, SynCad, RToolkit**.  
- Continuous improvement based on real project use.
- Autodesk Developers Network member since 2024

### 13.2 Global Validation  
- Published applications on the **Autodesk App Store**.  
- Member of the **Autodesk Developer Network (ADN)** – demonstrates technical credibility and global market readiness.

### 13.3 Strategic Partnerships  
- Collaboration with **Awura Tech PLC**.  
- Signed Memorandum of Understanding (MoU) with the **Construction Management Institute (CMI)** – expanding reach in technology integration and industry capacity building.

### 13.4 Market Validation  
- Pilot BIM implementations underway with real projects.  
- Transition from concept to real market application.

### 13.5 Ecosystem Engagement  
- Active participation in workshops, seminars, and digital technology events.  
- Contributions to BIM awareness and knowledge dissemination.

### 13.6 Traction Summary  
- Working products (not just concept).  
- Global platform presence.  
- Strategic partnerships secured.  
- Early project implementation underway.  
- Growing industry visibility.

---

## 14. Dissemination Strategy  

### 14.1 Industry Engagement & Outreach  
- Live demonstrations and roadshows for developers, consultants, and government institutions.  
- Active participation in national and international AEC forums to establish thought leadership.

### 14.2 Digital Learning Platform  
- YouTube channel with tutorials on Revit automation, BIM workflows, AI integration.  
- Future online knowledge hub with courses and resources.

### 14.3 Capacity Building Programs  
- Industry‑recognized BIM certifications.  
- Intensive bootcamps for graduates and practicing professionals.

### 14.4 Academic & Research Integration  
- University lectures and partnerships (e.g., Arba Minch University, Addis Ababa University).  
- Publications, white papers on BIM adoption, AI in AEC, sustainable digital construction.

### 14.5 Brand Positioning  
- Establish Paras Codarch as a center of excellence in BIM and AEC technology in Africa.

---

## 15. Team  

- **Seyoum Hagos** – Co‑Founder, Architect  
- **Hagos Aman** – Co‑Founder, Architect  
- Engineers & developers  
- Strategic advisors

---

## 16. Current Status  

✅ **Version 4.2.0 – Stable Build**  
- Core system operational  
- Ready for pilot deployment

---

## 17. Roadmap  

| Phase | Focus | Key Milestones |
|-------|-------|----------------|
| **Year 1: Ethiopia Market Entry** | Validation, revenue, ecosystem building | 3–5 pilot projects; 200+ professionals trained; first paying clients; local partnerships |
| **Year 2: Product Scaling** | Transition to recurring revenue | 500–1,000 SaaS users; 10+ enterprise clients; recognized BIM leader in Ethiopia |
| **Year 3: East Africa Expansion** | Regional growth | Presence in 2–3 East African countries; regional client portfolio; scaled SaaS adoption |

### 17.1 Long‑Term Vision  
- Become a leading BIM & AEC technology company in Africa.  
- Develop a fully integrated digital construction platform.  
- Expand into AI‑driven design and smart city solutions.

---

## 18. Financial Projections (5‑Year Model)

### 18.1 Revenue Projection (ETB)

| Year | Consultancy | SaaS Subscriptions | Training Programs | Custom Development | **Total Revenue** |
|------|-------------|--------------------|-------------------|--------------------|------------------|
| 1 | 3,000,000 | 500,000 | 1,200,000 | 800,000 | **5,500,000** |
| 2 | 4,500,000 | 1,500,000 | 2,000,000 | 1,200,000 | **9,200,000** |
| 3 | 6,000,000 | 3,500,000 | 3,000,000 | 2,000,000 | **14,500,000** |
| 4 | 7,500,000 | 6,500,000 | 4,000,000 | 3,000,000 | **21,000,000** |
| 5 | 9,000,000 | 10,000,000 | 5,500,000 | 4,500,000 | **29,000,000** |

### 18.2 Cost Structure (ETB)

| Cost Category | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|---------------|--------|--------|--------|--------|--------|
| Salaries | 2,400,000 | 3,600,000 | 5,000,000 | 6,500,000 | 8,000,000 |
| Office & Operations | 600,000 | 800,000 | 1,000,000 | 1,200,000 | 1,500,000 |
| Cloud & Infrastructure | 300,000 | 600,000 | 1,200,000 | 2,000,000 | 3,000,000 |
| Marketing & Sales | 200,000 | 500,000 | 1,000,000 | 1,500,000 | 2,000,000 |
| R&D / Product Dev | 800,000 | 1,200,000 | 1,800,000 | 2,500,000 | 3,500,000 |
| **Total Cost** | **4,300,000** | **6,700,000** | **10,000,000** | **13,700,000** | **18,000,000** |

### 18.3 Profit Projection (ETB)

| Year | Revenue | Cost | Net Profit |
|------|---------|------|------------|
| 1 | 5,500,000 | 4,300,000 | 1,200,000 |
| 2 | 9,200,000 | 6,700,000 | 2,500,000 |
| 3 | 14,500,000 | 10,000,000 | 4,500,000 |
| 4 | 21,000,000 | 13,700,000 | 7,300,000 |
| 5 | 29,000,000 | 18,000,000 | 11,000,000 |

### 18.4 Break‑Even Analysis  
✅ Break‑even achieved in **Year 1–2** – low‑risk entry, strong signal for investors.

### 18.5 SaaS Growth Assumptions  

| Year | Users | Avg Monthly Fee (ETB) | Annual SaaS Revenue (ETB) |
|------|-------|------------------------|---------------------------|
| 1 | 50 | 800 | 500,000 |
| 2 | 150 | 850 | 1,500,000 |
| 3 | 350 | 900 | 3,500,000 |
| 4 | 600 | 900 | 6,500,000 |
| 5 | 900+ | 950 | 10,000,000 |

---

## 19. Funding Ask  

### 19.1 Required Investment  
**$250,000 – $400,000 (Seed Round)**  
*Recommended Ask: $300,000*

### 19.2 Use of Funds  

| Category | % | Amount |
|----------|---|--------|
| Office & Infrastructure | 15% | $45,000 |
| Product Development | 25% | $75,000 |
| Hiring & Team | 30% | $90,000 |
| Cloud Infrastructure | 10% | $30,000 |
| Marketing & Scaling | 20% | $60,000 |
| **Total** | **100%** | **$300,000** |

### 19.3 Runway & Impact  
- **Runway:** 18–24 months  
- **Milestones Achieved with Funding:**  
  - 500+ SaaS users  
  - 10+ enterprise clients  
  - Strong recurring revenue base  
  - Market leadership in Ethiopia

### 19.4 Investor Value Proposition  
- Early entry into a **high‑growth, under‑digitized AEC market**.  
- Scalable **SaaS + consulting hybrid model**.  
- Strong traction with **working products and partnerships**.  
- Funding will move Paras Codarch from **early traction → scalable growth stage**.

---

## 20. Impact & Value  

- **Job creation** – “BIM Tool Smiths” instead of passive software users.  
- **Skill development** – massive upskilling of Ethiopian AEC professionals.  
- **Reduced construction waste** – less rework, better coordination.  
- **Increased efficiency** – automation accelerates project delivery.  
- **Supports national digital transformation** – aligns with government initiatives.

---

## 21. Call to Action  

🚀 **Let’s build the future of construction in Ethiopia – together.**

**Paras Codarch AEC Technology (PCAT)**  
Addis Ababa, Ethiopia  
📧 hagosaman2019@gmail.com  
📞 0911544413

**Open Source Project:** [github.com/Sey56/Paracore](https://github.com/Sey56/Paracore)