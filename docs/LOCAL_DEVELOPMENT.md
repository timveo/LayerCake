# FuzzyLlama Local Deployment Guide

## Quick Start (Automated)

The easiest way to run FuzzyLlama locally:

```bash
# Make sure you have PostgreSQL and Redis running, then:
./start-local.sh
```

This script will:
- ✅ Check PostgreSQL and Redis are running
- ✅ Create the database
- ✅ Install dependencies
- ✅ Run database migrations
- ✅ Start backend on http://localhost:3000
- ✅ Start frontend on http://localhost:5173

**To stop:**
```bash
./stop-local.sh
```

---

## Manual Setup (Step-by-Step)

If you prefer to run services individually or the automated script doesn't work:

### Prerequisites

1. **PostgreSQL** (v14 or later)
```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Or using Docker
docker run -d \
  --name fuzzyllama-postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  postgres:14
```

2. **Redis** (v6 or later)
```bash
# macOS
brew install redis
brew services start redis

# Or using Docker
docker run -d \
  --name fuzzyllama-redis \
  -p 6379:6379 \
  redis:7-alpine
```

3. **Node.js** (v18 or later)
```bash
# Check version
node --version  # Should be >= 18

# Install if needed
brew install node@18
```

### Database Setup

```bash
# Create database
psql -h localhost -U postgres -c "CREATE DATABASE fuzzyllama_dev;"

# Or if you need to reset:
psql -h localhost -U postgres -c "DROP DATABASE fuzzyllama_dev;"
psql -h localhost -U postgres -c "CREATE DATABASE fuzzyllama_dev;"
```

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Or push schema directly (faster for dev)
npx prisma db push

# Start backend
npm run start:dev
```

Backend will start on **http://localhost:3000**

### Frontend Setup

```bash
cd frontend

# Install dependencies (use legacy-peer-deps due to React 19)
npm install --legacy-peer-deps

# Start frontend
npm run dev
```

Frontend will start on **http://localhost:5173**

---

## Environment Variables

### Backend (.env in root)
Already created with sensible defaults. Key variables:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fuzzyllama_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
JWT_SECRET=dev-secret-key-at-least-32-characters-long-for-local

# AI APIs (add your keys)
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
```

### Frontend (.env in frontend/)
Already created:

```bash
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=http://localhost:3001
```

---

## Accessing the Application

### Frontend URLs
- **Main App**: http://localhost:5173
- **Login**: http://localhost:5173/login
- **Register**: http://localhost:5173/register

After logging in, you'll see:
- **Dashboard**: http://localhost:5173/dashboard
- **Dashboard Selector**: http://localhost:5173/dashboards (Choose V1, V2, or V3)
- **Create Project**: http://localhost:5173/projects/new
- **Tasks**: http://localhost:5173/tasks
- **Gates**: http://localhost:5173/gates
- **Settings**: http://localhost:5173/settings

### Backend URLs
- **API**: http://localhost:3000/api
- **Swagger Docs**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/health

### Dashboard Versions

FuzzyLlama has 3 different dashboard UI options to choose from:

1. **Mission Control** (V1): Dark, technical, developer-focused
   - http://localhost:5173/dashboard/mission-control

2. **Journey Map** (V2): Light, modern SaaS, professional
   - http://localhost:5173/dashboard/journey-map

3. **Living Canvas** (V3): Hybrid, feature-rich, adaptive
   - http://localhost:5173/dashboard/living-canvas

Visit http://localhost:5173/dashboards to see all three and choose your favorite!

---

## First Time Setup

1. **Start the services** (using `./start-local.sh` or manually)

2. **Register a new account**:
   - Go to http://localhost:5173/register
   - Create an account with email/password

3. **Explore the UI**:
   - Visit the dashboard selector: http://localhost:5173/dashboards
   - Try all 3 dashboard versions
   - Create your first project

---

## Troubleshooting

### PostgreSQL not starting
```bash
# Check if it's running
pg_isready -h localhost -p 5432

# Start it
brew services start postgresql@14

# Check logs
tail -f /usr/local/var/log/postgres.log
```

### Redis not starting
```bash
# Check if it's running
redis-cli ping

# Start it
brew services start redis

# Check logs
tail -f /usr/local/var/log/redis.log
```

### Port already in use
```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9

# Find process using port 5173
lsof -ti:5173 | xargs kill -9
```

### Database migration errors
```bash
cd backend

# Reset database
npx prisma migrate reset

# Or push schema
npx prisma db push --force-reset
```

### Frontend build errors
```bash
cd frontend

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

## Development Tips

### View Logs
```bash
# Backend logs
tail -f logs/backend.log

# Frontend logs
tail -f logs/frontend.log
```

### Database Management
```bash
cd backend

# View data in Prisma Studio (GUI)
npx prisma studio

# Opens on http://localhost:5555
```

### Hot Reload
Both frontend and backend support hot reload:
- **Backend**: Changes automatically restart the server
- **Frontend**: Changes instantly update in browser

### API Testing
Use the Swagger UI:
- http://localhost:3000/api/docs

Or use curl:
```bash
# Health check
curl http://localhost:3000/health

# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

---

## Production Features Already Working

✅ **All CRITICAL + HIGH Priority Items Complete**:
- Rate limiting (100 req/min)
- Environment validation (30+ variables)
- Input sanitization (DOMPurify)
- Security headers (CSP, HSTS)
- Token invalidation (Redis)
- Winston logging
- Type safety (proper TypeScript)
- Database optimization (no N+1 queries)
- WebSocket memory leak fixed
- Automated testing (95+ tests, >80% coverage)

---

## Next Steps

After you have it running locally:

1. **Choose your preferred dashboard** from the 3 options
2. **Add AI API keys** to `.env` (OPENAI_API_KEY, ANTHROPIC_API_KEY)
3. **Create a test project** to see the full workflow
4. **Explore the gate flow** (G0 → G9)
5. **Test agent execution** with real AI calls

---

**Need help?** Check:
- Backend logs: `logs/backend.log`
- Frontend logs: `logs/frontend.log`
- Database: `npx prisma studio` (in backend/)

**Ready to deploy to production?** See [PRODUCTION_READY.md](PRODUCTION_READY.md)
