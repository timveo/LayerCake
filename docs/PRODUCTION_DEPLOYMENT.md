# FuzzyLlama Deployment Guide

This guide covers deploying FuzzyLlama to production using Docker Compose and Railway.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment (Docker Compose)](#production-deployment-docker-compose)
4. [Railway Deployment](#railway-deployment)
5. [Monitoring & Observability](#monitoring--observability)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Node.js 20+**
- **Docker & Docker Compose**
- **PostgreSQL 16** (or use Docker image)
- **Redis 7** (or use Docker image)

### API Keys

You'll need API keys for:

1. **Anthropic** - https://console.anthropic.com/
2. **OpenAI** - https://platform.openai.com/
3. **GitHub OAuth** - https://github.com/settings/developers
4. **Cloudflare R2** - https://dash.cloudflare.com/
5. **(Optional) Sentry** - https://sentry.io/
6. **(Optional) PostHog** - https://posthog.com/
7. **(Optional) Stripe** - https://dashboard.stripe.com/

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/fuzzyllama.git
cd fuzzyllama
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```bash
# Minimum required for local dev
DATABASE_URL=postgresql://fuzzyllama:fuzzyllama_dev@localhost:5432/fuzzyllama
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-dev-secret-key
ANTHROPIC_API_KEY=sk-ant-your-key
OPENAI_API_KEY=sk-your-key
```

### 4. Start Infrastructure

```bash
# Start PostgreSQL + Redis + Observability Stack
docker-compose -f docker-compose.dev.yml up postgres redis

# Or start full stack with monitoring
docker-compose -f docker-compose.dev.yml up
```

### 5. Run Database Migrations

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 6. Seed Database (Optional)

```bash
npm run seed
```

### 7. Start Development Servers

```bash
# Terminal 1: Backend API
cd backend
npm run start:dev

# Terminal 2: Worker Service
cd backend
npm run start:worker

# Terminal 3: Frontend
cd frontend
npm run dev
```

### 8. Access Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **API Docs:** http://localhost:3000/api/docs
- **Grafana:** http://localhost:3001 (admin/admin)
- **Prometheus:** http://localhost:9090

---

## Production Deployment (Docker Compose)

### 1. Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y
```

### 2. Clone Repository

```bash
git clone https://github.com/your-org/fuzzyllama.git
cd fuzzyllama
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Production Environment Variables:**

```bash
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://api.your-domain.com

# Database
DATABASE_URL=postgresql://fuzzyllama:STRONG_PASSWORD@postgres:5432/fuzzyllama
POSTGRES_USER=fuzzyllama
POSTGRES_PASSWORD=STRONG_PASSWORD
POSTGRES_DB=fuzzyllama

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET=your-production-secret-key-min-32-chars
JWT_EXPIRATION=7d

# AI Providers
ANTHROPIC_API_KEY=sk-ant-your-production-key
OPENAI_API_KEY=sk-your-production-key

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=https://your-domain.com/auth/github/callback

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=fuzzyllama-production

# Sentry (Error Tracking)
SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/7890123

# PostHog (Analytics)
POSTHOG_API_KEY=phc_your-production-key

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=STRONG_ADMIN_PASSWORD

# Stripe (Billing)
STRIPE_SECRET_KEY=sk_live_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### 4. Build and Start Services

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f backend worker
```

### 5. Run Database Migrations

```bash
docker-compose exec backend npx prisma migrate deploy
```

### 6. Verify Deployment

```bash
# Check service health
curl http://localhost:3000/api/health

# Check metrics endpoint
curl http://localhost:3000/metrics

# View logs
docker-compose logs -f backend
docker-compose logs -f worker
```

### 7. Setup Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/fuzzyllama
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

    # Backend API
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/fuzzyllama /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
```

---

## Railway Deployment

Railway provides a simpler deployment option with managed infrastructure.

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Create New Project

```bash
railway init
```

### 3. Add Services

```bash
# Add PostgreSQL
railway add --database postgres

# Add Redis
railway add --database redis

# Deploy backend
railway up --service backend

# Deploy worker
railway up --service worker

# Deploy frontend
railway up --service frontend
```

### 4. Configure Environment Variables

```bash
# Set variables via Railway dashboard or CLI
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set OPENAI_API_KEY=sk-...
railway variables set JWT_SECRET=...
# ... etc
```

### 5. Run Migrations

```bash
railway run --service backend "npx prisma migrate deploy"
```

### 6. Setup Custom Domain

In Railway dashboard:
1. Go to Settings → Domains
2. Add custom domain
3. Configure DNS records as shown

### 7. Enable Auto-Deploy

Railway automatically deploys on push to main branch. To configure:

```yaml
# railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start:prod",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

---

## Monitoring & Observability

### Access Dashboards

Once deployed, access monitoring tools:

- **Grafana:** https://grafana.your-domain.com or http://your-server-ip:3001
- **Prometheus:** http://your-server-ip:9090
- **Sentry:** https://sentry.io/organizations/your-org/
- **PostHog:** https://app.posthog.com/

### Grafana Setup

1. Login to Grafana (admin / your-password)
2. Verify data sources:
   - Configuration → Data Sources → Prometheus (should be auto-configured)
   - Configuration → Data Sources → Tempo (should be auto-configured)
3. Import dashboards:
   - Dashboards → Browse → Should see 3 dashboards:
     - FuzzyLlama Overview
     - FuzzyLlama Agents
     - FuzzyLlama Gates & Workflows

### Configure Alerts

Edit `docker/prometheus/prometheus.yml`:

```yaml
rule_files:
  - 'alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

Create `docker/prometheus/alerts.yml`:

```yaml
groups:
  - name: fuzzyllama
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: sum(rate(fuzzyllama_errors_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: AgentFailureRate
        expr: sum(fuzzyllama_agent_execution_total{status="failed"}) / sum(fuzzyllama_agent_execution_total) > 0.1
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Agent failure rate above 10%"

      - alert: HighQueueDepth
        expr: fuzzyllama_queue_depth{status="waiting"} > 50
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Queue depth above 50 jobs"
```

---

## Troubleshooting

### Backend Won't Start

**Check logs:**

```bash
docker-compose logs backend
```

**Common issues:**

1. **Database connection failed**
   - Verify DATABASE_URL is correct
   - Ensure PostgreSQL is running: `docker-compose ps postgres`
   - Check PostgreSQL logs: `docker-compose logs postgres`

2. **Redis connection failed**
   - Verify REDIS_HOST and REDIS_PORT
   - Ensure Redis is running: `docker-compose ps redis`

3. **Missing environment variables**
   - Check .env file exists and is loaded
   - Verify all required variables are set

### Worker Not Processing Jobs

**Check logs:**

```bash
docker-compose logs worker
```

**Verify Redis connection:**

```bash
docker-compose exec redis redis-cli ping
# Should return: PONG
```

**Check queue depth:**

```bash
curl http://localhost:3000/api/queue/stats
```

### Database Migration Errors

**Reset database (⚠️ DEVELOPMENT ONLY):**

```bash
docker-compose down -v  # Deletes volumes
docker-compose up -d postgres
docker-compose exec backend npx prisma migrate reset
```

**Production migration issues:**

```bash
# Check migration status
docker-compose exec backend npx prisma migrate status

# Mark migration as applied (if already run manually)
docker-compose exec backend npx prisma migrate resolve --applied 20231201000000_migration_name
```

### High Memory Usage

**Check container stats:**

```bash
docker stats
```

**Optimize Node.js memory:**

```yaml
# docker-compose.yml
services:
  backend:
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
```

### Slow API Responses

**Check database query performance:**

```sql
-- Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second
SELECT pg_reload_conf();

-- View slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

**Check metrics in Grafana:**
- API response time (p95)
- Database query duration
- Queue processing time

### OpenTelemetry Not Sending Traces

**Verify Tempo is running:**

```bash
docker-compose logs tempo
curl http://localhost:3200/ready
```

**Check backend logs for OTLP export errors:**

```bash
docker-compose logs backend | grep OTLP
```

**Test trace ingestion:**

```bash
# Send test span
curl -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{"resourceSpans":[]}'
```

---

## Backup & Restore

### Database Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U fuzzyllama fuzzyllama > backup.sql

# Restore
docker-compose exec -T postgres psql -U fuzzyllama fuzzyllama < backup.sql
```

### Automated Backups

```bash
# Add to crontab
0 2 * * * docker-compose exec postgres pg_dump -U fuzzyllama fuzzyllama | gzip > /backups/fuzzyllama-$(date +\%Y\%m\%d).sql.gz
```

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET (min 32 characters)
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Configure firewall (ufw/iptables)
- [ ] Limit database access to localhost
- [ ] Enable Sentry error tracking
- [ ] Configure rate limiting
- [ ] Regular security updates: `docker-compose pull && docker-compose up -d`
- [ ] Monitor Sentry for security exceptions
- [ ] Review Grafana dashboards for anomalies

---

## Scaling

### Horizontal Scaling (Multiple Workers)

```yaml
# docker-compose.yml
services:
  worker:
    deploy:
      replicas: 5  # Scale to 5 workers
```

### Database Connection Pooling

```bash
# .env
DATABASE_URL=postgresql://user:pass@postgres:5432/fuzzyllama?connection_limit=20
```

### Redis Cluster (High Availability)

For production at scale, consider Redis Sentinel or Redis Cluster.

---

## Support

- **Documentation:** https://docs.fuzzyllama.dev
- **GitHub Issues:** https://github.com/your-org/fuzzyllama/issues
- **Discord:** https://discord.gg/fuzzyllama
- **Email:** support@fuzzyllama.dev

---

**Deployment Guide Version:** 2.0
**Last Updated:** 2026-01-09
