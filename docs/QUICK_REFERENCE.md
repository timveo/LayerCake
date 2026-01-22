# FuzzyLlama - Quick Reference Card

## 🚀 Start Application (3 commands)

```bash
cp .env.example .env                  # Configure environment
docker-compose up --build             # Start all services
docker-compose exec backend npm run prisma:migrate && npm run prisma:seed
```

**Access**: http://localhost | **API Docs**: http://localhost/api/docs

---

## 📋 Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/docs` | Swagger documentation |
| `POST /api/auth/login` | Login (coming soon) |
| `GET /api/projects` | List projects (coming soon) |

---

## 🗂️ Project Structure

```
FuzzyLlama/
├── backend/          # NestJS API (Port 3000)
├── frontend/         # React app (Port 80 via Nginx)
├── docker/           # Nginx config
├── .env.example      # Environment template
├── SETUP.md          # Full setup guide
└── SUMMARY.md        # Build summary
```

---

## 🔧 Development Commands

### Docker
```bash
docker-compose up               # Start services
docker-compose logs -f backend  # View logs
docker-compose down             # Stop services
```

### Backend
```bash
cd backend
npm run start:dev               # Dev mode
npm run prisma:studio           # DB GUI
npm run prisma:migrate          # Run migrations
npm test                        # Run tests
```

### Frontend
```bash
cd frontend
npm run dev                     # Dev mode (port 5173)
npm run build                   # Production build
npm test                        # Run tests
```

---

## 🎯 Current Status

✅ **Completed** (Phase 1 - 50%)
- Infrastructure (Docker Compose)
- Backend (NestJS + Prisma)
- Frontend (React + Vite + Tailwind)
- Database (50+ models, 40+ enums)
- Documentation

🚧 **Next Up** (Week 2)
- Authentication (JWT + GitHub OAuth)
- User management
- Login/Register UI

---

## 💾 Database

**Access**:
```bash
docker-compose exec postgres psql -U fuzzyllama -d fuzzyllama
```

**GUI**:
```bash
cd backend && npm run prisma:studio
# http://localhost:5555
```

**Models**: 50+ (User, Project, Task, Gate, Agent, Document, etc.)

---

## 🔑 Environment Variables

**Required**:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `JWT_SECRET` - JWT signing key
- `CLAUDE_API_KEY` or `OPENAI_API_KEY` - AI provider

**Optional**:
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` - OAuth
- `STRIPE_SECRET_KEY` - Billing
- `R2_*` - Cloudflare R2 storage

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| [SETUP.md](SETUP.md) | Complete setup guide |
| [SUMMARY.md](SUMMARY.md) | Build summary & progress |
| [MVP_BUILD_STATUS.md](MVP_BUILD_STATUS.md) | Current status |
| [.claude/plans/...](/.claude/plans/tingly-roaming-truffle.md) | Implementation plan |

---

## 🐛 Troubleshooting

**Port in use**:
```bash
lsof -i :3000           # Find process
kill -9 <PID>           # Kill it
```

**Database issues**:
```bash
docker-compose down -v  # Remove volumes
docker-compose up       # Restart fresh
```

**Prisma client error**:
```bash
cd backend
npm run prisma:generate
```

---

## 📞 Support

1. Check [SETUP.md](SETUP.md) troubleshooting section
2. View Docker logs: `docker-compose logs -f`
3. Check API docs: http://localhost/api/docs

---

**Test Login**: test@fuzzyllama.dev / password123 (after seeding)
