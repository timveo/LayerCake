# Start Here (5 Minutes)

## 3 Things to Know

1. **This is a playbook, not software** - It guides AI assistants to build apps for you
2. **You stay in control** - Approve every major decision before it happens
3. **Projects live separately** - Your app goes in its own folder (e.g., `~/projects/my-app`)

## How to Start

Open your terminal and run:
```bash
cd /path/to/Multi-Agent-Product-Creator
claude
```

Then say something like:
```
Create a new project called "my-app" at ~/projects/my-app

I want to build [describe your app idea in 1-2 sentences]
```

## What Happens Next

```
┌─────────────────────────────────────────────────────────────┐
│  YOU describe idea  →  AI asks 5 questions  →  AI builds   │
│                                                             │
│  You approve at each step. Nothing happens without your OK. │
└─────────────────────────────────────────────────────────────┘
```

**The 5 Questions:**
1. What are you building?
2. Do you have existing code?
3. What's your technical background?
4. What does "done" look like?
5. Any constraints?

## Approval Gates (You'll See These)

| When | What You're Approving |
|------|----------------------|
| After questions | Is this the right scope? |
| After planning | Are these the right features? |
| After design | Is this the right tech stack? |
| After building | Does it work correctly? |
| Before launch | Ready to go live? |

**How to approve:** Say "yes", "approved", "looks good", or "LGTM"

## Common Commands

| What You Want | What to Say |
|---------------|-------------|
| Start fresh | "Create a new project called X at ~/projects/X" |
| Check status | "What's the current status?" |
| Continue later | "Continue the project at ~/projects/X" |
| Get help | "Explain what's happening" |
| Make changes | "I want to change [specific thing]" |

## If You Get Lost

Say: **"Where are we and what should I do next?"**

The AI will show you:
- Current phase
- What's been done
- What's coming next
- Your options

## Tips for Success

1. **Be specific** - "Users can drag tasks to reorder" beats "make it easy to organize"
2. **State constraints early** - "I must use Supabase" or "Budget is $50 for AI costs"
3. **Start simple** - Core features first, add more later
4. **Ask questions** - Say "Why did you choose that?" anytime

## Example Session

```
You: Create a new project called "task-buddy" at ~/projects/task-buddy
     I want a simple task manager with categories.

AI:  Great! Let me ask a few quick questions...
     [5 questions happen]

AI:  Here's what I understood: [summary]
     Sound good?

You: Yes

AI:  [Creates PRD, shows features]
     Ready to design the architecture?

You: Yes

AI:  [Picks tech stack, explains why]
     Approve this approach?

You: Looks good

AI:  [Builds the app, shows progress]
     ...
```

## Need More Detail?

| Topic | Document |
|-------|----------|
| Full overview | [README.md](README.md) |
| Step-by-step guide | [GETTING_STARTED.md](GETTING_STARTED.md) |
| All the agents | [constants/core/AGENT_INDEX.md](constants/core/AGENT_INDEX.md) |

---

**Ready?** Open Claude Code and describe what you want to build!
