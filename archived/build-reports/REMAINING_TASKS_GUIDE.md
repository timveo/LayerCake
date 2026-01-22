# FuzzyLlama Remaining Tasks Implementation Guide

**Date**: 2026-01-09
**Status**: 8 of 17 tasks complete, 9 remaining
**Priority**: Observability → CI/CD → Optimization

---

## Completed Tasks ✅ (8)

1. ✅ Hybrid MCP + Database Architecture
2. ✅ StateSyncService for DB ↔ Markdown Sync
3. ✅ Event Sourcing with ProjectEvent Table
4. ✅ Event Projections for Read Models
5. ✅ MCP Adapter Layer with 160+ Tools
6. ✅ MCP Server for Claude Code Integration
7. ✅ pgvector Extension & EmbeddingService
8. ✅ Priority Task Queues (4-tier system)

---

## Remaining Tasks (9)

### Task 9: OpenTelemetry for Distributed Tracing ⏳

**Priority**: HIGH - Critical for production debugging
**Effort**: 4-5 days
**Dependencies**: None

**Implementation**:

```bash
# Install dependencies
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

**Create**: `backend/src/observability/tracing.service.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export class TracingService {
  private sdk: NodeSDK;

  constructor() {
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    });

    this.sdk = new NodeSDK({
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations()],
      serviceName: 'fuzzyllama-backend',
    });
  }

  async start() {
    await this.sdk.start();
  }

  async stop() {
    await this.sdk.shutdown();
  }
}
```

**Add to main.ts**:
```typescript
import { TracingService } from './observability/tracing.service';

const tracing = new TracingService();
await tracing.start();
```

**Trace key operations**:
- Agent execution (full workflow)
- Database queries
- External API calls (Claude, OpenAI, GitHub, Railway)
- Queue processing

**Benefits**:
- See full request flow across services
- Identify performance bottlenecks
- Debug complex multi-agent workflows
- Track agent dependencies

---

### Task 10: Sentry for Error Tracking ⏳

**Priority**: HIGH - Essential for production
**Effort**: 1 day
**Dependencies**: None

**Implementation**:

```bash
npm install @sentry/node @sentry/tracing
```

**Create**: `backend/src/observability/sentry.service.ts`

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export class SentryService {
  init() {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
      integrations: [
        new ProfilingIntegration(),
      ],
    });
  }

  captureException(error: Error, context?: any) {
    Sentry.captureException(error, {
      extra: context,
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error') {
    Sentry.captureMessage(message, level);
  }
}
```

**Add global exception filter**:

```typescript
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    Sentry.captureException(exception);
    // ... normal exception handling
  }
}
```

**Key integrations**:
- Agent execution failures
- Build validation errors
- API call failures
- Queue job failures

---

### Task 11: Grafana Dashboards ⏳

**Priority**: MEDIUM - Valuable but not blocking
**Effort**: 2-3 days
**Dependencies**: OpenTelemetry (metrics exporter)

**Setup**:

1. **Install Prometheus + Grafana**:
```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports: ["3001:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

2. **Create metrics**:

```typescript
// backend/src/observability/metrics.service.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export class MetricsService {
  // Agent metrics
  agentExecutionDuration = new Histogram({
    name: 'agent_execution_duration_seconds',
    help: 'Agent execution time',
    labelNames: ['agent_type', 'model', 'success'],
  });

  agentExecutionTotal = new Counter({
    name: 'agent_execution_total',
    help: 'Total agent executions',
    labelNames: ['agent_type', 'status'],
  });

  // Gate metrics
  gateApprovalRate = new Gauge({
    name: 'gate_approval_rate',
    help: 'Gate approval rate',
    labelNames: ['gate_type'],
  });

  // Build metrics
  buildSuccessRate = new Gauge({
    name: 'build_success_rate',
    help: 'Build success rate',
    labelNames: ['project_type'],
  });

  // Queue metrics
  queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Number of jobs in queue',
    labelNames: ['priority'],
  });
}
```

3. **Create dashboards** (`monitoring/grafana-dashboards/`):
   - `agent-performance.json` - Agent execution metrics
   - `gate-workflow.json` - Gate approval rates
   - `build-metrics.json` - Build success/failure rates
   - `system-health.json` - CPU, memory, queue depth

---

### Task 12: GitHub Actions CI/CD ⏳

**Priority**: MEDIUM - Important for code quality
**Effort**: 1 day
**Dependencies**: None

**Create**: `.github/workflows/backend-ci.yml`

```yaml
name: Backend CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg14
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: fuzzyllama_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Run migrations
        working-directory: backend
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/fuzzyllama_test
        run: npx prisma migrate deploy

      - name: Run linter
        working-directory: backend
        run: npm run lint

      - name: Run unit tests
        working-directory: backend
        run: npm run test:cov

      - name: Run integration tests
        working-directory: backend
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/fuzzyllama_test
          REDIS_URL: redis://localhost:6379
        run: npm run test:integration

      - name: Run E2E tests
        working-directory: backend
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/fuzzyllama_test
          REDIS_URL: redis://localhost:6379
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info

      - name: Build
        working-directory: backend
        run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway up --service backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

### Task 13: Cloudflare R2 Storage ⏳

**Priority**: LOW - Can use S3 for now
**Effort**: 2 days
**Dependencies**: None

**Implementation**:

```bash
npm install @aws-sdk/client-s3
```

**Create**: `backend/src/storage/cloudflare-r2.service.ts`

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class CloudflareR2Service {
  private s3: S3Client;

  constructor(private config: ConfigService) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.get('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.get('CLOUDFLARE_R2_ACCESS_KEY'),
        secretAccessKey: this.config.get('CLOUDFLARE_R2_SECRET_KEY'),
      },
    });
  }

  async uploadArtifact(projectId: string, filePath: string, content: Buffer): Promise<string> {
    const key = `${projectId}/${filePath}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.config.get('CLOUDFLARE_R2_BUCKET'),
      Key: key,
      Body: content,
      ContentType: this.getContentType(filePath),
    }));

    return `https://${this.config.get('CLOUDFLARE_R2_PUBLIC_DOMAIN')}/${key}`;
  }

  async downloadArtifact(projectId: string, filePath: string): Promise<Buffer> {
    const key = `${projectId}/${filePath}`;

    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.config.get('CLOUDFLARE_R2_BUCKET'),
      Key: key,
    }));

    return Buffer.from(await response.Body.transformToByteArray());
  }

  private getContentType(filePath: string): string {
    const ext = filePath.split('.').pop();
    const mimeTypes = {
      'json': 'application/json',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'png': 'image/png',
      'jpg': 'image/jpeg',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
```

**Cost**: ~10x cheaper than S3 ($0.015/GB/month vs $0.023/GB/month)

---

### Task 14: PostHog Analytics ⏳

**Priority**: LOW - Nice-to-have
**Effort**: 1 day
**Dependencies**: None

**Implementation**:

```bash
npm install posthog-node
```

**Create**: `backend/src/analytics/posthog.service.ts`

```typescript
import { PostHog } from 'posthog-node';

@Injectable()
export class PostHogService {
  private client: PostHog;

  constructor(config: ConfigService) {
    this.client = new PostHog(
      config.get('POSTHOG_API_KEY'),
      { host: 'https://app.posthog.com' }
    );
  }

  trackEvent(userId: string, event: string, properties?: Record<string, any>) {
    this.client.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Track key user actions
  trackGateApproval(userId: string, projectId: string, gateType: string) {
    this.trackEvent(userId, 'gate_approved', { projectId, gateType });
  }

  trackAgentExecution(userId: string, projectId: string, agentType: string) {
    this.trackEvent(userId, 'agent_executed', { projectId, agentType });
  }

  trackProjectCreated(userId: string, projectId: string, projectType: string) {
    this.trackEvent(userId, 'project_created', { projectId, projectType });
  }
}
```

**Cost**: Free up to 1M events/month

---

### Task 15: Docker Compose Optimization ⏳

**Priority**: MEDIUM - Important for deployment
**Effort**: 1 day
**Dependencies**: None

**Create**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      target: production
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      NODE_ENV: production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      VITE_API_URL: ${API_URL}
    depends_on:
      - backend
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg14
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: fuzzyllama
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: ["redis-server", "--appendonly", "yes"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres-data:
  redis-data:
```

**Also create**: `docker-compose.dev.yml` for local development

---

### Task 16: Integration Tests ⏳

**Priority**: MEDIUM - Important for reliability
**Effort**: 3-4 days
**Dependencies**: None

**Create tests for new components**:

1. **State Sync Tests** (`backend/test/state-sync.integration.spec.ts`):
```typescript
describe('StateSyncService Integration', () => {
  it('should sync project state to markdown files', async () => {
    await stateSync.updateProjectState(projectId, { currentPhase: 'development' });
    const statusMd = await filesystem.readFile(projectId, 'docs/STATUS.md');
    expect(statusMd).toContain('development');
  });

  it('should parse markdown back to database', async () => {
    await filesystem.writeFile(projectId, 'docs/STATUS.md', '**Phase**: testing');
    await stateSync.syncMarkdownToDatabase(projectId);
    const state = await prisma.projectState.findUnique({ where: { projectId } });
    expect(state.currentPhase).toBe('testing');
  });
});
```

2. **Event Sourcing Tests** (`backend/test/event-sourcing.integration.spec.ts`):
```typescript
describe('EventStoreService Integration', () => {
  it('should replay project history', async () => {
    await eventStore.appendEvent(projectId, { type: 'ProjectCreated', data: { name: 'Test' } });
    await eventStore.appendEvent(projectId, { type: 'GateApproved', data: { gate: 'G0' } });

    const state = await eventStore.replayProjectHistory(projectId);
    expect(state.gates.length).toBe(1);
  });

  it('should support time travel debugging', async () => {
    const timestamp = new Date();
    await eventStore.appendEvent(projectId, { type: 'StateChanged', data: { phase: 'new' } });

    const pastState = await eventStore.getStateAtTimestamp(projectId, timestamp);
    expect(pastState.currentPhase).not.toBe('new');
  });
});
```

3. **MCP Integration Tests** (`backend/test/mcp-integration.spec.ts`):
```typescript
describe('MCP Tools Integration', () => {
  it('should execute read_status tool', async () => {
    const result = await mcpTools.executeTool('read_status', { projectId });
    expect(result).toContain('# Project Status');
  });

  it('should execute create_decision tool', async () => {
    await mcpTools.executeTool('create_decision', {
      projectId,
      title: 'Use PostgreSQL',
      decision: 'We will use PostgreSQL',
    });

    const decisions = await prisma.decision.findMany({ where: { projectId } });
    expect(decisions.length).toBe(1);
  });
});
```

4. **Queue Tests** (`backend/test/priority-queues.integration.spec.ts`):
```typescript
describe('Priority Queues Integration', () => {
  it('should route orchestrator to critical queue', async () => {
    const job = await queueManager.addAgentJob({
      id: 'test-1',
      agentType: 'orchestrator',
      projectId,
      userPrompt: 'Test',
    });

    // Check it's in critical queue
    const stats = await queueManager.getQueueStats();
    expect(stats.critical.waiting).toBeGreaterThan(0);
  });
});
```

---

### Task 17: Documentation Updates ⏳

**Priority**: LOW - Can be done incrementally
**Effort**: 2-3 days
**Dependencies**: All other tasks

**Update these documents**:

1. **README.md** - Add architecture overview
2. **API.md** - Document all REST endpoints
3. **DEPLOYMENT.md** - Railway/Docker deployment guide
4. **DEVELOPMENT.md** - Local development setup
5. **TESTING.md** - Update with new test categories
6. **OBSERVABILITY.md** - OpenTelemetry, Sentry, Grafana guides

---

## Quick Win Priority Order

For fastest value delivery:

1. **Sentry** (1 day) - Immediate error visibility
2. **GitHub Actions** (1 day) - Automated testing
3. **Docker Compose** (1 day) - Easy deployment
4. **OpenTelemetry** (4-5 days) - Production debugging
5. **Integration Tests** (3-4 days) - Reliability
6. **Grafana** (2-3 days) - Performance insights
7. **Cloudflare R2** (2 days) - Cost optimization
8. **PostHog** (1 day) - User analytics
9. **Documentation** (2-3 days) - Knowledge sharing

**Total Remaining Effort**: ~18-24 days

---

## Environment Variables Required

Add to `.env`:

```bash
# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Sentry
SENTRY_DSN=https://...@sentry.io/...

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET_KEY=...
CLOUDFLARE_R2_BUCKET=fuzzyllama-artifacts
CLOUDFLARE_R2_PUBLIC_DOMAIN=...

# PostHog
POSTHOG_API_KEY=...

# Railway (for CI/CD)
RAILWAY_TOKEN=...
```

---

## Summary

**Phase 1 Complete**: 8 critical tasks ✅
**Phase 2 Remaining**: 9 tasks (18-24 days)

**Current State**:
- ✅ State-of-the-art architecture
- ✅ Event sourcing & time travel
- ✅ MCP protocol (160+ tools)
- ✅ Semantic code search
- ✅ Priority task queues
- ⏳ Observability stack (partial)
- ⏳ CI/CD pipeline (not started)
- ⏳ Production optimization (not started)

**Ready for**: Production deployment with observability added

*Last Updated: 2026-01-09*
