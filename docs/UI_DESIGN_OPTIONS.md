# FuzzyLlama MVP - UI Design Options

**Date:** 2026-01-09

---

## Design Option 1: "Developer Command Center" (Dark, Technical)

### Philosophy
A dark, terminal-inspired interface that appeals to developers. Think VS Code meets GitHub's command palette. Emphasizes keyboard shortcuts, CLI-like interactions, and real-time agent output.

### Color Palette
- **Background:** Dark slate (#0f172a, #1e293b)
- **Surface:** Darker gray (#1e293b, #334155)
- **Primary:** Electric blue (#3b82f6)
- **Accent:** Cyan (#06b6d4)
- **Success:** Green (#10b981)
- **Warning:** Amber (#f59e0b)
- **Error:** Red (#ef4444)
- **Text:** Light gray/white (#e2e8f0, #f8fafc)

### Layout & Navigation
```
┌─────────────────────────────────────────────────────────────┐
│  [⌘] FuzzyLlama                    [Profile] [Docs] [Settings]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │              │  │                                       │  │
│  │  SIDEBAR     │  │         MAIN CONTENT AREA            │  │
│  │              │  │                                       │  │
│  │  • Projects  │  │   ┌─────────────────────────────┐   │  │
│  │  • Tasks     │  │   │  TABS: Tasks | Gates | Docs │   │  │
│  │  • Gates     │  │   └─────────────────────────────┘   │  │
│  │  • Agents    │  │                                       │  │
│  │              │  │   ┌──────────┐ ┌──────────┐         │  │
│  │  [+ New]     │  │   │  CARD    │ │  CARD    │         │  │
│  │              │  │   └──────────┘ └──────────┘         │  │
│  └──────────────┘  └─────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  AGENT OUTPUT TERMINAL (collapsible)                    │ │
│  │  > orchestrator: Analyzing project requirements...      │ │
│  │  > backend_dev: Creating API endpoints...               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Features
- **Command Palette:** `Cmd/Ctrl + K` opens command search
- **Keyboard Navigation:** Full keyboard shortcuts for everything
- **Terminal Panel:** Bottom-docked terminal showing real-time agent output
- **Monospace Elements:** Code blocks, agent names, IDs use JetBrains Mono
- **Status Indicators:** Colored dots for gate status (🟢🟡🔴)
- **Minimal Borders:** Use subtle shadows and background colors instead

### Components Style

#### Login Page
```
┌─────────────────────────────────────────┐
│                                         │
│         ⌘ FuzzyLlama                     │
│                                         │
│    ┌─────────────────────────────┐     │
│    │  Email                      │     │
│    │  [___________________]      │     │
│    │                             │     │
│    │  Password                   │     │
│    │  [___________________]      │     │
│    │                             │     │
│    │  [→ Sign In]                │     │
│    │                             │     │
│    │  Don't have an account?     │     │
│    │  [Create one →]             │     │
│    └─────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

#### Dashboard
- **Project Cards:** Dark cards with gradient borders
- **Stats:** Small inline stats with icons
- **Agent Status:** Animated pulsing dots for running agents
- **Quick Actions:** Floating action button (FAB) for "Create Project"

#### Task Board
- **Kanban Columns:** Vertical columns with drag-drop
- **Task Cards:** Compact, hover shows full details
- **Inline Edit:** Click to edit title/status
- **Phase Pills:** Small colored badges for phases

#### Gate Approval
- **Gate Flow:** Horizontal timeline showing G0 → G9
- **Current Gate:** Highlighted with glow effect
- **Approval Modal:** Full-screen modal with checklist
- **Proof Artifacts:** File upload area with drag-drop

#### Agent Execution
- **Agent Selector:** Grid of agent cards with icons
- **Live Output:** Terminal-style streaming output
- **Token Counter:** Real-time token usage display
- **Stop Button:** Red emergency stop button

### Typography
- **Headers:** Inter (sans-serif) - Bold, 24-32px
- **Body:** Inter - Regular, 14-16px
- **Code/Terminal:** JetBrains Mono - 13px
- **Buttons:** Inter - Semibold, 14px

### Animation & Interactions
- **Hover:** Subtle scale (1.02x) and glow
- **Click:** Quick press effect (0.98x scale)
- **Agent Output:** Typewriter effect for new lines
- **Gate Progress:** Animated progress bar
- **Loading:** Pulse animation on cards

### Technologies
- **Components:** Custom components (no heavy library)
- **Icons:** Lucide React (minimal, sharp icons)
- **Animations:** Framer Motion
- **Code Editor:** Monaco Editor (VS Code editor)
- **Markdown:** MDX Editor for documents

---

## Design Option 2: "Modern SaaS Dashboard" (Light, Professional)

### Philosophy
A clean, modern SaaS interface inspired by Linear, Notion, and Vercel. Light theme with excellent typography, subtle shadows, and smooth animations. Professional yet approachable.

### Color Palette
- **Background:** Pure white (#ffffff)
- **Surface:** Light gray (#f8f9fa, #f1f3f5)
- **Primary:** Indigo (#6366f1)
- **Accent:** Violet (#8b5cf6)
- **Success:** Green (#22c55e)
- **Warning:** Orange (#f97316)
- **Error:** Rose (#f43f5e)
- **Text:** Dark gray (#18181b, #3f3f46)

### Layout & Navigation
```
┌─────────────────────────────────────────────────────────────┐
│  FuzzyLlama    Projects  Tasks  Gates  Agents    [👤]        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  📦 Project Name              [Edit] [Settings]      │   │
│  │  Traditional • G2 Complete • 45% Complete            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌────────┬────────┬────────┬──────────┬──────────┐         │
│  │ Tasks  │ Gates  │  Docs  │  Specs   │  Agents  │         │
│  └────────┴────────┴────────┴──────────┴──────────┘         │
│                                                               │
│  ┌────────────────────────────────────────────────┐          │
│  │                                                │          │
│  │  ┌──────────────┐  ┌──────────────┐           │          │
│  │  │              │  │              │           │          │
│  │  │  Card        │  │  Card        │           │          │
│  │  │              │  │              │           │          │
│  │  └──────────────┘  └──────────────┘           │          │
│  │                                                │          │
│  └────────────────────────────────────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Features
- **Top Navigation:** Horizontal tabs for main sections
- **Breadcrumbs:** Always show where you are
- **Search Everything:** Global search (Cmd+K) with fuzzy matching
- **Notifications:** Bell icon with badge count
- **Contextual Actions:** Right sidebar for quick actions
- **Inline Editing:** Edit-in-place for most fields

### Components Style

#### Login Page
```
┌─────────────────────────────────────────┐
│                                         │
│  ┌────────────┐     FuzzyLlama          │
│  │ 🎂 Logo    │     AI Development     │
│  └────────────┘     Platform           │
│                                         │
│  Sign in to your account                │
│                                         │
│  Email address                          │
│  [_________________________]            │
│                                         │
│  Password                               │
│  [_________________________]            │
│  [Forgot password?]                     │
│                                         │
│  [Sign in]                              │
│                                         │
│  or                                     │
│                                         │
│  [Continue with GitHub]                 │
│                                         │
│  Don't have an account? [Sign up]      │
│                                         │
└─────────────────────────────────────────┘
```

#### Dashboard
- **Project Grid:** 3-column responsive grid
- **Project Cards:**
  - Large project name
  - Type badge (Traditional/AI/Hybrid)
  - Progress bar
  - Current gate indicator
  - Last updated timestamp
  - Avatar stack of team members
- **Empty State:** Friendly illustration + "Create your first project"
- **Quick Stats:** Top bar with total projects, active agents, gates passed

#### Task Board
- **List View Option:** Alternative to Kanban
- **Filters Bar:** Filter by status, priority, assignee, phase
- **Bulk Actions:** Select multiple tasks for bulk edit
- **Task Details Drawer:** Slides in from right
- **Comments Section:** Add notes to tasks
- **Activity Timeline:** See all changes

#### Gate Approval
- **Wizard Style:** Step-by-step approval flow
- **Checklist:** Required items with checkboxes
- **Proof Upload:** Drag-drop file area
- **Review Summary:** All info on one page before approval
- **Approval History:** See who approved and when

#### Agent Execution
- **Agent Gallery:** Grid of agent cards with descriptions
- **Execution Form:** Clean form with model selector
- **Progress Tracker:** Shows current step
- **Output Viewer:** Formatted output with syntax highlighting
- **Save Templates:** Save common prompts

### Typography
- **Headers:** Plus Jakarta Sans - Semibold, 28-36px
- **Body:** Inter - Regular, 15px
- **Captions:** Inter - Regular, 13px
- **Buttons:** Inter - Medium, 15px
- **Code:** Fira Code - 14px

### Animation & Interactions
- **Page Transitions:** Smooth fade + slide
- **Hover:** Lift effect with shadow increase
- **Click:** Subtle press feedback
- **Loading:** Skeleton screens, not spinners
- **Success:** Green checkmark animation
- **Error:** Shake animation

### Technologies
- **Components:** shadcn/ui (Radix UI primitives)
- **Icons:** Lucide React
- **Animations:** CSS transitions + Framer Motion
- **Forms:** React Hook Form + Zod validation
- **Tables:** TanStack Table
- **Charts:** Recharts

---

## Design Option 3: "Hybrid Workspace" (Adaptive, Feature-Rich)

### Philosophy
A flexible, adaptive interface that combines the best of both worlds. Dark mode toggle, customizable layout, and advanced features for power users. Think Figma meets GitHub meets Slack.

### Color Palette (Supports both themes)

**Light Mode:**
- Background: White (#ffffff)
- Surface: Gray 50 (#f9fafb)
- Primary: Blue (#2563eb)
- Accent: Purple (#9333ea)

**Dark Mode:**
- Background: Gray 900 (#111827)
- Surface: Gray 800 (#1f2937)
- Primary: Sky (#0ea5e9)
- Accent: Purple (#a855f7)

### Layout & Navigation
```
┌─────────────────────────────────────────────────────────────┐
│  ☰  FuzzyLlama         🔍 Search...        🔔 ⚙️ 🌓 👤       │
├───┬─────────────────────────────────────────────────────────┤
│ P │  Breadcrumb: Projects / My Project / Tasks              │
│ R ├─────────────────────────────────────────────────────────┤
│ O │                                                          │
│ J │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│ E │  │  LEFT PANEL  │  │ MAIN CONTENT │  │ RIGHT PANEL  │  │
│ C │  │              │  │              │  │              │  │
│ T │  │  • Overview  │  │  Task Board  │  │  Agent       │  │
│ S │  │  • Tasks     │  │              │  │  Output      │  │
│   │  │  • Gates     │  │  ┌────────┐  │  │              │  │
│ A │  │  • Docs      │  │  │ Task 1 │  │  │  [Execute]   │  │
│ G │  │  • Specs     │  │  └────────┘  │  │              │  │
│ E │  │  • Agents    │  │              │  │  History:    │  │
│ N │  │              │  │  ┌────────┐  │  │  - Task 1    │  │
│ T │  │  [+ Create]  │  │  │ Task 2 │  │  │  - Task 2    │  │
│ S │  │              │  │  └────────┘  │  │              │  │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  │
│   │                                                          │
├───┴──────────────────────────────────────────────────────────┤
│  Status Bar: Agent: orchestrator running • 12,450 tokens    │
└─────────────────────────────────────────────────────────────┘
```

### Key Features
- **Three-Panel Layout:** Collapsible left sidebar, main content, right panel
- **Customizable Views:** Drag panels to rearrange
- **Split Screen:** View tasks + gate at same time
- **Quick Switcher:** Cmd+K for fuzzy search everything
- **Workspace Presets:** Save layout configurations
- **Theme Toggle:** Dark/Light/Auto with smooth transition
- **Focus Mode:** Hide sidebars for distraction-free work

### Components Style

#### Login Page
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │                  │  │                  │        │
│  │   HERO IMAGE     │  │   LOGIN FORM     │        │
│  │   (3D Render)    │  │                  │        │
│  │                  │  │  Welcome back    │        │
│  │   Features:      │  │                  │        │
│  │   • 14 AI Agents │  │  Email           │        │
│  │   • G0-G9 Gates  │  │  [__________]    │        │
│  │   • Auto Deploy  │  │                  │        │
│  │                  │  │  Password        │        │
│  │                  │  │  [__________]    │        │
│  │                  │  │                  │        │
│  │                  │  │  [Sign In]       │        │
│  │                  │  │                  │        │
│  │                  │  │  [GitHub] [Demo] │        │
│  │                  │  │                  │        │
│  └──────────────────┘  └──────────────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Dashboard
- **Customizable Widgets:** Drag-drop dashboard widgets
- **Recent Activity Feed:** Timeline of all actions
- **Quick Actions Card:** Common tasks as buttons
- **Agent Status Board:** Live status of all agents
- **Gate Progress Chart:** Visual chart of gate completions
- **Project Switcher:** Dropdown with recent projects

#### Task Board
- **Multiple Views:** Kanban, List, Calendar, Timeline
- **Advanced Filters:** Multi-select filters with AND/OR logic
- **Saved Views:** Save filter combinations
- **Bulk Operations:** Multi-select with action bar
- **Keyboard Shortcuts:** Arrow keys navigation, hotkeys for actions
- **Split Pane:** View task detail side-by-side with list

#### Gate Approval
- **Interactive Timeline:** Click any gate to expand
- **Gate Dashboard:** All gates in one view
- **Parallel Gates:** Show dependencies between gates
- **Approval Workflow:** Multi-step approval with signatures
- **Audit Trail:** Complete history of all approvals

#### Agent Execution
- **Agent Comparison:** Compare multiple agent outputs
- **Template Library:** Pre-built prompts
- **Execution Queue:** Queue multiple agents
- **Live Monitoring:** Real-time metrics (tokens, latency)
- **Output Diff:** Compare before/after outputs
- **Export Results:** Download as JSON/MD/PDF

### Typography
- **Headers:** Space Grotesk - Bold, 24-40px
- **Body:** Inter - Regular, 14-16px
- **Code:** Berkeley Mono - 13px
- **Buttons:** Inter - Medium, 14px

### Animation & Interactions
- **Panel Transitions:** Smooth slide animations
- **Theme Switch:** Morphing colors (not abrupt)
- **Drag & Drop:** Ghost preview of dragged item
- **Loading:** Progress bars with estimated time
- **Agent Output:** Smooth scroll-to-bottom
- **Notifications:** Slide in from top-right

### Technologies
- **Components:** Hybrid - shadcn/ui + custom
- **Icons:** Lucide React + custom SVG icons
- **Animations:** Framer Motion (advanced)
- **Layout:** React Grid Layout (draggable)
- **Charts:** Recharts + D3.js for complex viz
- **Rich Text:** Tiptap editor
- **Code Editor:** CodeMirror 6

---

## Comparison Matrix

| Feature | Option 1: Dev Center | Option 2: SaaS | Option 3: Hybrid |
|---------|---------------------|----------------|------------------|
| **Theme** | Dark only | Light only | Both (toggle) |
| **Complexity** | Medium | Low | High |
| **Learning Curve** | Steep | Gentle | Medium |
| **Keyboard Nav** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Customization** | ⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| **Mobile Support** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Speed** | Fast | Very Fast | Medium |
| **Dev Time** | 2-3 weeks | 1-2 weeks | 3-4 weeks |
| **Target User** | Developers | Everyone | Power Users |
| **Modern Feel** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Accessibility** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## Recommended Approach

### Best for MVP: **Option 2 - Modern SaaS Dashboard**

**Why:**
1. ✅ **Fastest to build** (1-2 weeks) using shadcn/ui
2. ✅ **Lowest learning curve** for all users
3. ✅ **Professional appearance** for demos/investors
4. ✅ **Best accessibility** with Radix UI primitives
5. ✅ **Mobile responsive** out of the box
6. ✅ **Well-documented patterns** (Linear, Notion, Vercel)

**Build first, enhance later:**
- Start with Option 2 (SaaS) for MVP
- Add dark mode toggle later
- Add advanced features (Option 3) post-launch
- Terminal panel (Option 1) can be added as separate view

### Implementation Priority:
1. **Week 1:** Auth pages, Dashboard, Project CRUD
2. **Week 2:** Task board, Gate approval, Basic agent execution
3. **Week 3:** Documents/Specs, Polish, Testing
4. **Week 4:** WebSocket integration, Real-time updates

---

## Next Steps

**Choose a design direction and I'll build:**
1. Component library setup (shadcn/ui or custom)
2. Authentication pages (Login/Register)
3. Main dashboard layout
4. Project detail page
5. Task board (Kanban)
6. Gate approval interface

**What's your preference?**
- Option 1 (Developer Command Center - Dark, Technical)
- Option 2 (Modern SaaS Dashboard - Light, Professional) ⭐ **Recommended**
- Option 3 (Hybrid Workspace - Adaptive, Feature-Rich)
- Mix features from multiple options?
