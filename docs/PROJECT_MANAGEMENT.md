# Multi-Project Management Guide

This guide explains how to manage multiple coding projects using the Multi-Agent Development System.

---

## 📁 Directory Structure

```
Product-Creator-Multi-Agent-/
├── agents/                          # Shared agent prompts (used by all projects)
│   ├── orchestrator.md
│   ├── product-manager.md
│   ├── architect.md
│   └── ...
│
├── templates/                       # Templates for new projects
│   ├── PROJECT_README.md
│   └── docs/
│       ├── PRD.md
│       ├── ARCHITECTURE.md
│       ├── STATUS.md
│       └── DECISIONS.md
│
├── projects/                        # (Ignored) optional local clones if you choose to keep them here
├── archived/                        # (Ignored) optional local clones of archived projects
│
├── PROJECTS.md                      # Project registry (tracks all projects)
├── PROJECT_MANAGEMENT.md            # This file
└── README.md                        # System documentation
```

---

## 🚀 Creating a New Project (dedicated repository per project)

### Step 1: Create project repository on GitHub (or your VCS)
- Create an empty repo: `https://github.com/your-org/[project-name]`
- Keep the project as its own git root (do not nest it under this repo in source control history).

### Step 2: Scaffold locally from the agent system

```bash
# From the agent-system repo
cd Product-Creator-Multi-Agent-

# Create a sibling directory for the new project (outside this repo)
mkdir -p ../[project-name]
cd ../[project-name]

git init
git remote add origin https://github.com/your-org/[project-name].git

# Copy templates from the agent system
cp ../Product-Creator-Multi-Agent-/templates/PROJECT_README.md README.md
mkdir -p docs
cp ../Product-Creator-Multi-Agent-/templates/docs/* docs/

# Add a .gitignore suited to the stack (example base)
cat > .gitignore <<'EOF'
node_modules/
.env
.env.local
dist/
build/
*.log
.DS_Store
coverage/
.vscode/
.idea/
__pycache__/
.pytest_cache/
EOF
```

### Step 3: Update Project Registry (in agent system repo)
- Edit `PROJECTS.md` in this repo to add the project name, URL, and local path (if cloned).

### Step 4: Start the agent workflow
- Tell the Orchestrator which project path to use (e.g., `../[project-name]`) or provide the clone URL.
- The Orchestrator and specialized agents work inside that project repo only; the agent system repo stays clean.

### Step 5: Archive
- Archive the project in its own repo (tag/release/transfer).
- Optionally keep a shallow clone under `archived/` for reference, but do not commit project code to this repo.

---

## 📝 Documenting Tech Stack

### In Project README.md

Update the Tech Stack section with your specific technologies:

```markdown
## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18.2.0
- **Language**: TypeScript 5.3.0
- **Styling**: Tailwind CSS 3.4.0
- **State Management**: Zustand 4.5.0
- **Build Tool**: Vite 5.0.0

### Backend
- **Runtime**: Node.js 20.11.0
- **Framework**: Express.js 4.18.0
- **Language**: TypeScript 5.3.0
- **ORM**: Prisma 5.8.0
- **API Style**: REST

### Database
- **Primary Database**: PostgreSQL 16.1
- **Caching**: Redis 7.2.0

### DevOps & Infrastructure
- **Deployment Platform**: Vercel (Frontend), Railway (Backend)
- **Deployment Tier**: Tier 2
- **CI/CD**: GitHub Actions
- **Monitoring**: DataDog

### Testing
- **Unit Testing**: Vitest 1.2.0
- **E2E Testing**: Playwright 1.41.0
- **API Testing**: Supertest 6.3.0
- **Test Coverage**: 85%
```

### In docs/ARCHITECTURE.md

Include detailed tech stack decisions:

```markdown
## Technology Stack Decisions

### DEC-001: Frontend Framework - React
**Decision**: Use React 18 with TypeScript
**Rationale**:
- Large ecosystem and community
- Excellent TypeScript support
- Team familiarity
- Component reusability

**Alternatives Considered**:
- Vue.js: Smaller ecosystem
- Svelte: Less mature, smaller community
- Angular: Steeper learning curve

### DEC-002: Backend Framework - Express
**Decision**: Use Express.js with TypeScript
**Rationale**:
- Lightweight and flexible
- Middleware ecosystem
- Easy to integrate with other tools

**Alternatives Considered**:
- Fastify: Less ecosystem support
- NestJS: More opinionated, heavier
```

---

## 🗄️ Archiving Completed Projects

### When to Archive

Archive a project when:
- ✅ Project is fully deployed and stable
- ✅ All documentation is complete
- ✅ No active development planned
- ✅ Maintenance mode or handed off

### Archiving Process

#### Step 1: Prepare for Archive

```bash
# Ensure all work is committed in the PROJECT repository
cd ../[project-name]   # Navigate to the project (sibling directory)
git status
git add .
git commit -m "Final commit before archiving"
git push origin main

# Update project documentation
# - Mark STATUS.md as "Completed"
# - Add final metrics to README.md
# - Document lessons learned
```

#### Step 2: Archive the Project

**Option A: Tag and Archive in Place (Recommended)**

Projects are separate Git repositories. Archive by tagging and updating the registry:

```bash
# In the PROJECT repository
cd ../[project-name]

# Create an archive tag
git tag -a "archived-$(date +%Y-%m-%d)" -m "Project archived"
git push origin --tags

# Update PROJECTS.md in the agent system to mark as archived
```

**Option B: Create Archive Copy (if you need local reference)**

```bash
# From the agent system directory
cd Product-Creator-Multi-Agent-
mkdir -p archived

# Clone a shallow copy for reference (preserves git history reference)
git clone --depth 1 ../[project-name] archived/[project-name]

# Or create a snapshot without git history
cp -r ../[project-name] archived/[project-name]
rm -rf archived/[project-name]/.git  # Remove nested git to avoid conflicts
```

**⚠️ Warning:** Never use `mv` to move a git repository into another git repository. This creates nested repos which cause issues.

#### Step 3: Update Project Registry

Edit `PROJECTS.md`:

```markdown
## Active Projects
<!-- Remove the project from here -->

## Archived Projects

### [Project Name]
- **Completed**: 2024-XX-XX
- **Archive Location**: `archived/[project-name]/`
- **Final Status**: ✅ Deployed to Production
- **Repository**: https://github.com/username/[project-name]
- **Deployed URL**: https://project-name.vercel.app
- **Tech Stack**: React, Node.js, PostgreSQL, Vercel, Railway
- **Final Metrics**:
  - Lines of Code: 15,420
  - Test Coverage: 87%
  - Monthly Active Users: 1,200
  - Average Response Time: 180ms
- **Summary**: Successfully delivered task management application with real-time collaboration features. Deployed to production and stable for 3 months.
- **Lessons Learned**:
  - WebSocket scaling required Redis adapter
  - Implemented optimistic UI updates for better UX
  - PostgreSQL connection pooling critical for performance
```

#### Step 4: Create Archive Summary

```bash
# Create archive summary document
cat > archived/[project-name]/ARCHIVE_SUMMARY.md << 'EOF'
# Project Archive Summary

**Project Name**: [Project Name]
**Archived Date**: YYYY-MM-DD
**Project Duration**: X months
**Final Status**: ✅ Successfully Deployed

## Project Overview
[Brief description]

## Final Tech Stack
- Frontend: [Technologies]
- Backend: [Technologies]
- Database: [Technologies]
- Deployment: [Platforms]

## Achievements
- ✅ All user stories completed
- ✅ 87% test coverage
- ✅ Deployed to production
- ✅ 1,200+ active users

## Final Metrics
- Lines of Code: 15,420
- Number of Components: 48
- API Endpoints: 23
- Database Tables: 12
- Test Coverage: 87%

## Production Performance
- Uptime: 99.8%
- Average Response Time: 180ms
- Peak Concurrent Users: 350
- Monthly Requests: 2.5M

## Cost Analysis
- Monthly Infrastructure Cost: $85
- Development Cost: [If applicable]
- Maintenance Cost: $20/month

## Lessons Learned
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

## Handoff Information
- **Repository**: [URL]
- **Deployment**: [URLs]
- **Documentation**: See docs/ directory
- **Access**: [Credentials location]
- **Support**: [Contact info]

## Future Recommendations
- [Recommendation 1]
- [Recommendation 2]

EOF
```

---

## 🔄 Switching Between Projects

### Using Claude Code / AI Assistant

Simply specify which project you're working on:

```
"I want to work on the task-manager project in projects/task-manager"
```

The system will:
1. Navigate to the correct project directory
2. Load project-specific documentation
3. Use the shared agents from root `agents/` directory
4. Update project-specific `docs/STATUS.md`

### Manual Navigation

```bash
# List all active projects
cd Product-Creator-Multi-Agent-
ls -la projects/

# Switch to specific project
cd projects/[project-name]

# Check project status
cat docs/STATUS.md

# Check what phase we're in
git log --oneline -10
```

---

## 📊 Project Tracking

### Daily Tracking

Each project maintains its own `docs/STATUS.md`:

```markdown
# Project Status

**Last Updated**: 2024-XX-XX

## Current Phase
🟢 Development - Sprint 2

## Active Tasks
- [ ] Implement user authentication (Backend Dev)
- [ ] Create login UI (Frontend Dev)
- [ ] Write auth tests (QA Engineer)

## Completed This Week
- [x] Set up database schema
- [x] Create API endpoints for users
- [x] Deploy to staging

## Blockers
- None

## Next Milestone
Complete authentication system (Due: 2024-XX-XX)
```

### Weekly Review

```bash
# Generate weekly summary across all projects
cd Product-Creator-Multi-Agent-

# List all projects and their status
for dir in projects/*/; do
  echo "=== $(basename $dir) ==="
  cat "$dir/docs/STATUS.md" | head -20
  echo ""
done
```

---

## 🛠️ Best Practices

### 1. Separate Repositories
- Each project has its own git repository
- Enables independent version control
- Easier to manage deployments
- Clean separation of concerns

### 2. Shared Agents
- All projects use the same agent prompts from `agents/`
- Updates to agents benefit all projects
- Consistent development methodology

### 3. Project Templates
- Use templates for consistency
- Easier onboarding for new projects
- Standardized documentation

### 4. Regular Updates
- Update `PROJECTS.md` weekly
- Keep `docs/STATUS.md` current
- Document decisions in `docs/DECISIONS.md`

### 5. Archive Maintenance
- Archive completed projects promptly
- Document lessons learned
- Keep archive organized

---

## 📋 Quick Reference Commands

```bash
# Create new project as sibling to agent system
mkdir -p ../[name] && cd ../[name] && git init
git remote add origin https://github.com/your-org/[name].git
cp ../Product-Creator-Multi-Agent-/templates/PROJECT_README.md README.md
mkdir -p docs && cp ../Product-Creator-Multi-Agent-/templates/docs/* docs/

# List local project clones (siblings to agent system)
ls -la ../

# Switch to a project repo for agent work
cd ../[name]

# Archive project (Option A - tag in place, recommended)
cd ../[name] && git tag -a "archived-$(date +%Y-%m-%d)" -m "Archived" && git push origin --tags

# Archive project (Option B - local snapshot copy)
cd ../Product-Creator-Multi-Agent- && mkdir -p archived
cp -r ../[name] archived/[name] && rm -rf archived/[name]/.git

# View statuses across locally cloned projects (if STATUS.md exists)
for dir in ../*/docs/STATUS.md; do echo "=== $(dirname $(dirname $dir)) ==="; head -20 "$dir"; done
```

---

## 🔍 Finding Projects

### By Tech Stack

```bash
# Find all React projects
grep -l "React" projects/*/README.md

# Find all AI-powered projects
grep -l "Anthropic\|OpenAI" projects/*/README.md
```

### By Status

```bash
# Find projects in development phase
grep -l "Development" projects/*/docs/STATUS.md

# Find blocked projects
grep -l "Blocked" projects/*/docs/STATUS.md
```

### By Date

```bash
# Find recently started projects (last 30 days)
find projects/ -name "README.md" -mtime -30
```

---

## 💡 Tips

1. **Keep projects focused**: One project = one application
2. **Use descriptive names**: `e-commerce-platform` not `project1`
3. **Document early**: Create tech stack docs during architecture phase
4. **Archive regularly**: Don't let completed projects clutter active directory
5. **Review archived projects**: Learn from past successes and mistakes
6. **Update PROJECTS.md**: Keep the registry current for quick reference
7. **Use consistent structure**: Follow the templates for all projects

---

## 📞 Support

For questions about multi-project management:
- See `PROJECTS.md` for project registry
- See `README.md` for system overview
- See individual project README.md files for project-specific info
