# Project Registry

This file tracks all projects managed by the Multi-Agent Development System.

## Active Projects
> Each project is its own git repository. The `Directory` value is an optional local clone path (not committed to this repo).

### Project Template
````markdown
### [Project Name]
- **Status**: 🟢 Active / 🟡 In Progress / 🔴 Blocked
- **Type**: Traditional Web App / AI-Powered App / Mobile App / API Service
- **Directory**: `projects/[project-name]/`
- **Repository**: `https://github.com/username/project-name`
- **Started**: YYYY-MM-DD
- **Current Phase**: Planning / Architecture / Development / Testing / Deployment / Maintenance
- **Tech Stack**: [See project README]
- **Team Size**: X developers
- **Next Milestone**: [Description]
````

---

## Active Projects

### Converge-NPS
- **Status**: 🟡 In Progress
- **Type**: Full-Stack Web App (Mobile-First)
- **Directory**: `../Converge-NPS/` (sibling local clone; separate repo)
- **Repository**: `https://github.com/timveo/Converge-NPS.git`
- **Started**: 2025-12-02
- **Current Phase**: Development
- **Tech Stack**: React + TypeScript (Frontend), Python + FastAPI (Backend)
- **Team Size**: Multi-Agent Development System

### Loveable-Converge
- **Status**: 🟡 In Progress
- **Type**: Web App
- **Directory**: `../loveable-converge/` (sibling local clone; separate repo)
- **Repository**: `https://github.com/timveo/loveable-converge.git`
- **Started**: 2025-12-02
- **Current Phase**: Development
- **Tech Stack**: React + TypeScript, Vite, Tailwind, Supabase
- **Team Size**: Multi-Agent Development System

### Aether Trace MVP 2
- **Status**: 🟡 In Progress
- **Type**: AI-Powered App + API Service
- **Directory**: `../aether-trace-mvp/` (sibling local clone; separate repo)
- **Repository**: `https://github.com/timveo/Aether-Trace-MVP`
- **Started**: 2025-11-15
- **Current Phase**: Planning
- **Tech Stack**: React + TypeScript, Python + FastAPI, PostgreSQL + Neo4j, PyTorch + DGL
- **Team Size**: Multi-Agent Development System (14 agents)
- **Next Milestone**: Complete PRD and Architecture Design
- **Timeline**: 12-month MVP
- **Classification**: UNCLASSIFIED/FOUO
- **Special Requirements**: NVIDIA GPU infrastructure for AI training

---

## Archived Projects

Completed projects are moved to `archived/` directory.

### [Archived Project Name]
- **Completed**: YYYY-MM-DD
- **Archive Location**: `archived/[project-name]/`
- **Final Status**: ✅ Deployed / 📦 Delivered / ❌ Cancelled
- **Repository**: [Link]
- **Summary**: [Brief description of outcome]

---

## Project Statistics

- **Total Active Projects**: 3
- **Total Archived Projects**: 0
- **Success Rate**: N/A (no completed projects yet)
- **Average Completion Time**: N/A (no completed projects yet)

---

## Quick Commands

### Create New Project
```bash
# Create new project directory
mkdir -p projects/[project-name]
cd projects/[project-name]

# Initialize git repository
git init
git remote add origin https://github.com/username/[project-name].git

# Create project structure
mkdir -p docs agents
cp ../../templates/PROJECT_README.md README.md
cp -r ../../templates/docs/* docs/
```

### Archive Completed Project
```bash
# Move project to archive
mv projects/[project-name] archived/[project-name]

# Update PROJECTS.md to reflect archive
# Add completion date and final status
```

### List All Projects
```bash
# List active projects
ls -la projects/

# List archived projects
ls -la archived/
```

---

## Notes

- Each project has its own git repository
- Projects are independent and isolated
- Shared agents are in root `agents/` directory
- Each project has its own `docs/` for project-specific documentation
- Tech stack is documented in each project's README.md
