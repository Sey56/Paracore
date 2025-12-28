# Cloud Features (AI & Agentic Automation)

Paracore's cloud features (`rap-auth-server`) provide authentication, team management, and workspace registration. Features like AI Script Generation and Agentic Automation are client-side integrations where using your own API keys (e.g. Gemini) is required.
> **⚠️ Advanced Setup Required:** Setting up the Cloud Authentication server (`rap-auth-server`) requires experience with cloud hosting (e.g., Railway, AWS) and OAuth configuration. We recommend most users start with the **Offline Mode** ("Continue Offline") to use the powerful Core Automation features immediately without this complexity.

## Features Overview

### 1. AI Script Generation
- **Status:** ✅ Functional (Gemini API only)
- **Description:** Generate Revit automation scripts using natural language prompts
- **Requirements:** Your own Google Gemini API key (free tier available) - Not hosted by Paracore auth server

### 2. Agentic Automation
- **Status:** ⚠️ Functional but needs further development
- **Description:** Chat-based automation using LangGraph
- **Features:**
  - Discovers available scripts (tools)
  - Selects appropriate scripts based on user intent
  - Presents parameters in the Script Inspector for review
  - HITL (Human-in-the-Loop) approval modal before execution
  - Executes approved scripts

### 3. Team Collaboration
- **Status:** ✅ Complete
- **Description:** Shared workspaces, user roles, team management
- **Features:**
  - Admin, Developer, and User roles
  - Registered workspaces (Git-based)
  - Role-based script visibility

---

## Setup Instructions

### 1. Deploy rap-auth-server

**Option A: Railway (Recommended for testing)**
- Free tier: $1/month credit
- Deploy from GitHub
- Set environment variables in Railway dashboard

**Option B: Self-hosted**
- Deploy to any server with Python 3.12+
- Use Docker Compose (see `rap-auth-server/server/docker-compose.yml`)

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/paracore_auth

# Google OAuth (for "Sign in with Google")
GOOGLE_CLIENT_ID_DESKTOP=your_client_id
GOOGLE_CLIENT_SECRET_DESKTOP=your_client_secret

# JWT Keys (generate using generate_keys.py)
JWT_PRIVATE_KEY=jwt_private.pem
JWT_PUBLIC_KEY=jwt_public.pem

# Session
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

### 3. Generate JWT Keys

```bash
cd rap-auth-server/server
python generate_keys.py
```

This creates `jwt_private.pem` and `jwt_public.pem` (excluded from git).

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Desktop App)
5. Add authorized redirect URIs
6. Copy Client ID and Secret to `.env`

### 5. Configure Paracore UI

In the Paracore app:
1. Click **"Sign in with Google"**
2. Authenticate with your Google account
3. Cloud-based Team features will be enabled, and the "Generate" / "Agent" tabs will be unlocked. Enter your Gemini API key in settings for AI features.

---

## Using Cloud Features

### AI Script Generation

1. Sign in with Google
2. Navigate to the **"Generate"** tab
3. Enter a natural language prompt (e.g., "Create walls in a circle")
4. Review the generated script
5. Execute or save for later

**Current Limitations:**
- Only works with free Gemini API
- No support for other LLMs (OpenAI, Claude, etc.) yet
- Generated scripts may need manual refinement

### Agentic Automation

1. Sign in with Google
2. Navigate to the **"Agent"** tab
3. Chat with the agent (e.g., "Count all walls on Level 1")
4. Agent will:
   - Find relevant scripts
   - Present parameters in the Script Inspector
   - Show HITL approval modal
5. Review and approve execution

**Current Limitations:**
- Agent logic needs refinement (sometimes selects wrong scripts)
- Parameter extraction could be more intelligent
- No multi-step task planning yet

---

## Development Roadmap

### AI Script Generation
- [ ] Add support for OpenAI GPT-4
- [ ] Add support for Anthropic Claude
- [ ] Improve prompt engineering
- [ ] Add script validation before execution
- [ ] Create a library of example prompts

### Agentic Automation
- [ ] Improve script selection logic
- [ ] Add multi-step task planning
- [ ] Better parameter inference from context
- [ ] Add conversation memory
- [ ] Support for complex workflows (e.g., "Create a building")

### Team Collaboration
- [ ] Script marketplace (share/discover scripts)
- [ ] Team analytics (usage stats, popular scripts)
- [ ] Version control integration (PR reviews in UI)
- [ ] Real-time collaboration (multiple users editing)

---

## Troubleshooting

### "Sign in with Google" not working
- Verify `GOOGLE_CLIENT_ID_DESKTOP` and `GOOGLE_CLIENT_SECRET_DESKTOP` are correct
- Check authorized redirect URIs in Google Cloud Console
- Ensure rap-auth-server is running and accessible

### AI Script Generation fails
- Verify Gemini API key is valid
- Check API quota limits
- Review error logs in rap-server console

### Agent doesn't find scripts
- Ensure "Agent Scripts Path" is set in Settings
- Verify scripts have proper metadata
- Check rap-server logs for errors

---

## Cost Considerations

### Free Tier (Current Setup)
- **Gemini API:** Free tier (60 requests/minute)
- **Railway Hosting:** $1/month credit (sufficient for testing)
- **Google OAuth:** Free

### Paid Tier (Future)
- **OpenAI GPT-4:** ~$0.03 per 1K tokens
- **Railway Hosting:** ~$5-20/month (depending on usage)
- **Database:** PostgreSQL on Railway (included in hosting)

---

**Questions?** Open an issue on GitHub or contact the Paras Codarch Team.
