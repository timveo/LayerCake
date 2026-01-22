# FuzzyLlama

An AI-powered application that helps users plan, design, develop, and deploy production software through coordinated multi-agent workflows.

## Overview

FuzzyLlama orchestrates specialized AI agents to guide users through the complete software development lifecycle—from initial concept to production deployment. It provides human oversight at critical decision points while automating the heavy lifting of professional software development.

> **Note:** FuzzyLlama is derived from the [Multi-Agent-Product-Creator](https://github.com/your-org/Multi-Agent-Product-Creator) framework. All capabilities from that agent framework are built into FuzzyLlama as product features with a full web UI.

### What It Does

- **Plan** - AI-assisted requirements gathering, PRD creation, and architecture design
- **Design** - UX/UI wireframes, design systems, and component specifications
- **Develop** - Coordinated frontend and backend development with quality checks
- **Deploy** - Security review, infrastructure setup, and production deployment

## Key Features

### Multi-Agent System
14 specialized agents work together:
- **Orchestrator** - Coordinates workflow and task assignment
- **Product Manager** - Requirements and PRD creation
- **Architect** - System design and tech stack selection
- **Frontend/Backend Developers** - Implementation
- **QA Engineer** - Testing and validation
- **Security Engineer** - Security audits and compliance
- **DevOps Engineer** - Infrastructure and CI/CD
- Plus ML-specific agents for AI/ML projects

### Approval Gates (G1-G9)
9 human checkpoints ensure quality and alignment:

| Gate | When | Decision |
|------|------|----------|
| **G1** | After intake | Approve scope |
| **G2** | After planning | Approve PRD |
| **G3** | After architecture | Approve tech stack |
| **G4** | After design | Approve UX/UI |
| **G5** | After development | Accept features |
| **G6** | After testing | Quality sign-off |
| **G7** | After security | Security acceptance |
| **G8** | Pre-deployment | Go/no-go |
| **G9** | Post-deployment | Production acceptance |

### Project Types
- **Traditional** - Standard web applications
- **AI/ML** - Projects with ML models and data pipelines
- **Hybrid** - Combined traditional + AI components

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Backend | NestJS, PostgreSQL, Prisma, Redis, Bull |
| Frontend | React 19, Vite, Tailwind CSS, Zustand |
| Real-time | Socket.io WebSockets |
| AI | Anthropic Claude, OpenAI |
| Integrations | GitHub, Stripe, Railway |

## Project Structure

```
FuzzyLlama/
├── backend/          # NestJS API server (17+ modules)
├── frontend/         # React 19 web application
├── mcp-server/       # MCP state management server
├── agents/           # Agent prompt templates (reference)
├── constants/        # Protocols and definitions (reference)
├── templates/        # Project starter templates
├── docs/             # Documentation
├── docker/           # Docker configuration
├── scripts/          # Utility scripts
└── schemas/          # JSON schemas
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/FuzzyLlama.git
cd FuzzyLlama

# Use the automated start script
./start-local.sh

# Or manually:
cd backend && npm install && npm run start:dev
cd ../frontend && npm install && npm run dev
```

See [SETUP.md](SETUP.md) for detailed setup instructions.

### Docker Setup

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f
```

## Documentation

### Core Documentation
- [Setup Guide](SETUP.md) - Local development setup
- [Architecture](docs/ARCHITECTURE.md) - System architecture
- [Workflows](docs/WORKFLOWS.md) - Complete workflow specifications
- [Gate Enforcement](docs/GATE_ENFORCEMENT.md) - Approval gate implementation

### Deployment
- [Local Development](docs/LOCAL_DEVELOPMENT.md) - Running locally
- [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) - Production setup

### Reference Material
The `agents/` and `constants/` directories contain reference material from the Multi-Agent-Product-Creator framework:

| Directory | Purpose |
|-----------|---------|
| `agents/` | 14 agent prompt templates |
| `constants/core/` | Fundamental definitions (phases, states, enums) |
| `constants/protocols/` | Operational protocols (handoffs, approvals) |
| `constants/advanced/` | Complex orchestration (parallel work, task queues) |

### API Documentation
When running locally: http://localhost:3000/api/docs

## Quality Targets

| Metric | Target |
|--------|--------|
| Test coverage | ≥80% |
| API response p95 | <500ms |
| Page load p95 | <2000ms |
| Lighthouse performance | ≥90 |
| Security vulnerabilities | 0 critical/high |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[License details]
