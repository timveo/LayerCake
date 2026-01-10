# LayerCake Grafana Dashboards

This directory contains pre-configured Grafana dashboards for monitoring LayerCake.

## Dashboards

1. **layercake-overview.json** - High-level system overview
   - Agent execution totals and success rates
   - Total cost and token usage
   - Queue depth by priority
   - Error rates

2. **layercake-agents.json** - Detailed agent metrics
   - Success/failure rates by agent type
   - Execution duration by model
   - Token usage breakdown
   - Cost analysis by agent and model

3. **layercake-gates.json** - Gate workflow metrics
   - Gate transitions over time
   - Approval duration
   - Build success rates
   - Test coverage
   - Build duration by stage

## Setup

### 1. Start Prometheus + Grafana (Docker Compose)

```yaml
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus:latest
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'

grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - grafana_data:/var/lib/grafana
    - ./grafana-dashboards:/etc/grafana/provisioning/dashboards
```

### 2. Configure Prometheus

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'layercake'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'
```

### 3. Import Dashboards

#### Option A: Auto-provisioning
Place dashboard JSONs in Grafana's provisioning directory (already configured in docker-compose.yml).

#### Option B: Manual Import
1. Open Grafana (http://localhost:3001)
2. Login (admin/admin)
3. Go to Dashboards → Import
4. Upload each JSON file
5. Select Prometheus as data source

## Metrics Reference

### Agent Metrics
- `layercake_agent_execution_total` - Total executions by agent type and status
- `layercake_agent_execution_duration_seconds` - Execution duration histogram
- `layercake_agent_tokens_used_total` - Token usage by type (input/output)
- `layercake_agent_cost_usd_total` - Cost in USD

### Gate Metrics
- `layercake_gate_transitions_total` - Gate transitions
- `layercake_gate_approval_duration_seconds` - Time to approve gates
- `layercake_current_gate_status` - Current gate status (0=pending, 1=approved, 2=rejected)

### Build Metrics
- `layercake_build_executions_total` - Build executions by status
- `layercake_build_duration_seconds` - Build duration by stage
- `layercake_test_coverage_percentage` - Test coverage percentage

### Queue Metrics
- `layercake_queue_depth` - Queue depth by priority and status
- `layercake_queue_processing_duration_seconds` - Queue processing time

### Code Generation Metrics
- `layercake_files_generated_total` - Total files generated
- `layercake_lines_generated_total` - Total lines of code generated

### Database Metrics
- `layercake_db_query_duration_seconds` - Database query duration

### Error Metrics
- `layercake_errors_total` - Total errors by type and severity

## Alerts (TODO)

Configure Prometheus alerts for:
- High error rates (>5% in 5m)
- Slow agent execution (p95 >60s)
- High queue depth (>50 jobs)
- Low success rate (<90%)

## OpenTelemetry Integration

Traces are exported to an OTLP backend (e.g., Jaeger, Tempo) configured via:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

View traces in Grafana's Explore tab with Tempo data source.
