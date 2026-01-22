# Getting Started in 5 Minutes

Welcome! This guide gets you building your first project in under 5 minutes.

---

## What Is This?

The **Product Creator Multi-Agent System** is a **prompt engineering framework** that coordinates specialized AI agents to help you build software applications.

**Important:** This is not standalone software that "runs" on its own. You use it **with an AI assistant** like:
- **Claude Code** (recommended)
- Claude via API
- ChatGPT with the system prompt loaded
- Any LLM that can follow structured prompts

Think of it as a **playbook** that guides AI assistants through professional software development practices.

---

## Quick Start (3 Steps)

### Step 1: Open Claude Code in This Directory

```bash
cd Product-Creator-Multi-Agent-
claude
```

The system prompt in `.claude/system-prompt.md` automatically loads.

### Step 2: Tell It What to Build

**For a new project, say:**
```
Create a new project called "my-todo-app" at ~/projects/my-todo-app

I want to build a simple todo list application where users can:
- Add, edit, and delete tasks
- Mark tasks as complete
- Filter by status (all, active, completed)
```

**For an existing project, say:**
```
Enhance the project at ~/projects/existing-app

I want to add user authentication to my existing React app.
```

### Step 3: Answer the Quick Questions

The system asks a few key questions:

| Question | Example Answer |
|----------|----------------|
| What type of app? | Web application |
| Does it need AI/ML? | No |
| Use a starter template? | None (custom) |
| Who are the users? | Individual users managing personal tasks |
| Must-have features? | Add tasks, mark complete, delete |

That's it! The system creates your project and guides you through building it.

---

## What Happens Next?

After setup, the system:

1. **Creates your project** in a separate directory with docs/
2. **Activates the Product Manager** to create requirements (PRD)
3. **Asks for your approval** before proceeding
4. **Activates the Architect** to design the system
5. **Guides development** through Frontend, Backend, QA, and DevOps agents
6. **Delivers production code** ready to deploy

At each step, you review and approve before moving forward.

---

## Common Commands

| What You Want | What to Say |
|---------------|-------------|
| Start new project | "Create a new project called X at ~/projects/X" |
| Enhance existing code | "Enhance the project at ~/projects/existing" |
| Check status | "What's the current status?" |
| Resume work | "Continue working on the project at ~/projects/X" |
| See what's next | "What should we do next?" |
| Skip to specific phase | "Let's move to the development phase" |
| Get help | "Explain the current phase" |

---

## Project Types

### Simple App (No Starter)
Best for: Learning, small tools, custom requirements
```
"Create a new project called my-app at ~/projects/my-app"
```

### SaaS Application
Best for: B2B/B2C apps with auth, billing, dashboards
```
"Create a new project using the saas-app starter at ~/projects/my-saas"
```

### AI Chatbot
Best for: Conversational AI with streaming responses
```
"Create a new project using the ai-chatbot starter at ~/projects/my-bot"
```

### REST API
Best for: Backend services, mobile app backends
```
"Create a new project using the api-only starter at ~/projects/my-api"
```

### Landing Page
Best for: Marketing sites, product launches
```
"Create a new project using the landing-page starter at ~/projects/my-site"
```

---

## What Gets Created

Your project directory will look like this:

```
~/projects/my-todo-app/
├── .git/                    # Git repository
├── docs/
│   ├── INTAKE.md           # Your project requirements
│   ├── STATUS.md           # Current progress
│   ├── PRD.md              # Product requirements
│   ├── ARCHITECTURE.md     # System design
│   ├── DECISIONS.md        # Why we made choices
│   └── MEMORY.md           # Lessons learned
├── src/                     # Your application code
├── tests/                   # Test files
└── README.md               # Project documentation
```

---

## The Approval Gates

You stay in control. The system pauses at these checkpoints:

| Gate | When | You Decide |
|------|------|------------|
| **G1** | After project setup | Is the scope right? |
| **G2** | After requirements | Are the features correct? |
| **G3** | After architecture | Is the tech stack acceptable? |
| **G4** | After design | Does the UI/UX look right? |
| **G5** | After development | Does it work as expected? |
| **G6** | After testing | Is quality acceptable? |
| **G7** | After security review | Is it secure enough? |
| **G8** | Before deployment | Ready to go live? |
| **G9** | After deployment | Is production working? |

At each gate, you can:
- **Approve** - Move forward
- **Modify** - Request changes
- **Reject** - Go back and redo

---

## Tips for Best Results

### Be Specific About Requirements
```
# Good
"Users should be able to drag and drop tasks to reorder them"

# Vague
"Make it easy to organize tasks"
```

### State Your Constraints Upfront
```
"I must use Supabase for the database - this is non-negotiable"
"Keep the existing frontend design exactly as-is"
```

### Start Simple
Begin with core features. You can always add more later.

### Review Each Phase
Don't rush through approvals. The system catches issues early to save time later.

---

## Troubleshooting

### "I'm lost, what's happening?"
Say: `"What's the current status and what should we do next?"`

### "I want to change something we already decided"
Say: `"I want to change [X]. Can we revisit that decision?"`

### "This is taking too long"
Say: `"Let's use a starter template to speed things up"` or `"Skip the detailed intake, let's start simple"`

### "I want to stop and continue later"
Say: `"Update the STATUS.md with our current progress"` - then come back anytime and say `"Continue the project at [path]"`

### "The AI is doing something wrong"
Say: `"Stop. That's not what I want. Let me clarify..."` - then explain what you actually need.

---

## Example Session

```
You: Create a new project called "task-buddy" at ~/projects/task-buddy
     I want a simple task manager with categories and due dates.

AI:  I'll create a new project at ~/projects/task-buddy.
     Let me ask a few quick questions...

     1. Is this a web app, mobile app, or API?
You: Web app

AI:  2. Will this need AI/ML features?
You: No

AI:  3. Who will use this?
You: Just me, for personal task management

AI:  4. Any specific tech preferences?
You: I like React and would prefer Supabase for the backend

AI:  Great! I'm creating your project now...
     [Creates directory, initializes git, copies templates]

     Project created! Here's the summary:
     - Name: task-buddy
     - Type: Traditional web app
     - Stack: React + Supabase

     Ready to proceed to planning?
You: Yes

AI:  [Activates Product Manager]
     Creating your PRD with user stories...
```

---

## Need More Detail?

| Topic | Document |
|-------|----------|
| Full system overview | [README.md](README.md) |
| Managing multiple projects | [PROJECT_MANAGEMENT.md](PROJECT_MANAGEMENT.md) |
| All available agents | [constants/core/AGENT_INDEX.md](constants/core/AGENT_INDEX.md) |
| Workflow details | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| Starter templates | [templates/starters/INDEX.md](templates/starters/INDEX.md) |

---

## Ready?

Open Claude Code and tell it what you want to build. The system handles the rest.

```bash
claude
```

Then say: **"Create a new project called [your-project-name] at ~/projects/[your-project-name]"**

Happy building!
