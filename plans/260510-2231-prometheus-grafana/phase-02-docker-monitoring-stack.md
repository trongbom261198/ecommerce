# Phase 02 — Docker Monitoring Stack (Prometheus + Grafana)

## Context Links
- [plan.md](./plan.md)
- [phase-01-spring-actuator.md](./phase-01-spring-actuator.md) (BLOCKER)
- Existing compose: `BE/docker-compose.yml` (network `ecommerce-network`, bridge driver)

## Overview
- Priority: P2 (blocks Phase 3)
- Status: pending
- Add `prometheus` + `grafana` containers to existing `BE/docker-compose.yml`. Configure Prometheus to scrape 7 host-port targets via `host.docker.internal`. Configure Grafana with provisioned Prometheus datasource (dashboards land in Phase 3).

## Key Insights
- Services run on **host** (no Dockerfiles for app code). From inside the prometheus container, `localhost` would mean the prometheus container itself — must use `host.docker.internal` (works on Docker Desktop Win/Mac out of the box; on Linux requires `extra_hosts: - "host.docker.internal:host-gateway"`).
- Grafana provisioning lets us bake the Prometheus datasource into source control — no manual UI clicks on each environment.
- File ownership in this phase is purely on `BE/monitoring/**` and the compose file — no app code touched.
- Prometheus 15s scrape interval is plenty for dev. Default retention 15 days (`--storage.tsdb.retention.time=15d`).

## Requirements

### Functional
- `prometheus` container reachable at `http://localhost:9090`, scrapes 7 services every 15s.
- `grafana` container reachable at `http://localhost:3000`, default login `admin` / `admin` (forced password change disabled for dev).
- Grafana auto-loads Prometheus as default datasource on first start.
- Both services listed in `ecommerce-network` and survive `docker compose restart`.

### Non-functional
- Prometheus + Grafana RAM combined < 400 MB on idle dev box.
- Stack starts in <30s end-to-end.

## Architecture

### Data flow
```
Spring services (host:8080..8086) ──► /actuator/prometheus (text/plain)
        ▲
        │ scrape every 15s via host.docker.internal:<port>
        │
   ┌────┴────────┐                ┌────────┐
   │ prometheus  │ ◄── PromQL ─── │ grafana│ ──► browser :3000
   │  :9090      │                │ :3000  │
   └─────────────┘                └────────┘
   (ecommerce-network)            (ecommerce-network)
```

### Directory layout (NEW)
```
BE/
└── monitoring/
    ├── prometheus/
    │   ├── prometheus.yml           # scrape config
    │   └── rules/                   # (Phase 3 fills)
    └── grafana/
        ├── provisioning/
        │   ├── datasources/
        │   │   └── prometheus.yml   # datasource def
        │   └── dashboards/
        │       └── dashboards.yml   # dashboard provider config (Phase 3 adds JSONs)
        └── dashboards/              # (Phase 3 fills)
```

## Related Code Files

### To MODIFY
- `BE/docker-compose.yml` — append `prometheus` and `grafana` services + 2 named volumes.

### To CREATE
- `BE/monitoring/prometheus/prometheus.yml`
- `BE/monitoring/grafana/provisioning/datasources/prometheus.yml`
- `BE/monitoring/grafana/provisioning/dashboards/dashboards.yml`
- `BE/monitoring/prometheus/rules/.gitkeep` (placeholder for Phase 3)
- `BE/monitoring/grafana/dashboards/.gitkeep` (placeholder for Phase 3)

### To DELETE
- None.

## Implementation Steps

### 1. Create `BE/monitoring/prometheus/prometheus.yml`
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: ecommerce-dev
    env: local

# rule_files: enabled in Phase 3
# rule_files:
#   - /etc/prometheus/rules/*.yml

scrape_configs:
  - job_name: 'spring-services'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets:
          - 'host.docker.internal:8080'
          - 'host.docker.internal:8081'
          - 'host.docker.internal:8082'
          - 'host.docker.internal:8083'
          - 'host.docker.internal:8084'
          - 'host.docker.internal:8085'
          - 'host.docker.internal:8086'
    relabel_configs:
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8080'
        target_label: service
        replacement: 'api-gateway'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8081'
        target_label: service
        replacement: 'user-service'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8082'
        target_label: service
        replacement: 'product-service'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8083'
        target_label: service
        replacement: 'order-service'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8084'
        target_label: service
        replacement: 'inventory-service'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8085'
        target_label: service
        replacement: 'fulfillment-service'
      - source_labels: [__address__]
        regex: 'host\.docker\.internal:8086'
        target_label: service
        replacement: 'delivery-service'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### 2. Create `BE/monitoring/grafana/provisioning/datasources/prometheus.yml`
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      httpMethod: POST
      timeInterval: 15s
```

### 3. Create `BE/monitoring/grafana/provisioning/dashboards/dashboards.yml`
```yaml
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

### 4. Append to `BE/docker-compose.yml`
Add under `services:` (before `volumes:` block):
```yaml
  prometheus:
    image: prom/prometheus:v2.54.1
    container_name: ecommerce-prometheus
    user: root
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9090/-/healthy"]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.2.2
    container_name: ecommerce-grafana
    depends_on:
      prometheus:
        condition: service_healthy
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_INSTALL_PLUGINS: ""
    ports:
      - "3000:3000"
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped
```

Add to `volumes:` block:
```yaml
  prometheus_data:
    driver: local
  grafana_data:
    driver: local
```

### 5. Bring up the stack
```powershell
cd BE
docker compose up -d prometheus grafana
docker compose ps prometheus grafana
```

### 6. Verify
- `http://localhost:9090/targets` — all 7 spring-services targets `UP` (green).
- `http://localhost:9090/graph` — query `up{job="spring-services"} == 1` returns 7 series.
- `http://localhost:3000` — login admin/admin. Connections → Data sources → "Prometheus" exists, marked default, "Save & test" returns green.

## Todo List

- [ ] Create `BE/monitoring/` directory tree
- [ ] Write `BE/monitoring/prometheus/prometheus.yml`
- [ ] Write `BE/monitoring/grafana/provisioning/datasources/prometheus.yml`
- [ ] Write `BE/monitoring/grafana/provisioning/dashboards/dashboards.yml`
- [ ] Add `prometheus` + `grafana` services to `BE/docker-compose.yml`
- [ ] Add `prometheus_data` + `grafana_data` named volumes
- [ ] `docker compose up -d prometheus grafana` succeeds
- [ ] All 7 targets `UP` in Prometheus UI
- [ ] Grafana datasource auto-provisioned and "Test" passes

## Success Criteria
- `docker compose ps` shows both containers `Up (healthy)`.
- `curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length'` returns >= 8 (7 spring + 1 self).
- All `spring-services` targets show `health: up`.
- `curl -u admin:admin http://localhost:3000/api/datasources/name/Prometheus` returns 200 JSON.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `host.docker.internal` not resolvable on Linux Docker | Med | High | Explicit `extra_hosts: host.docker.internal:host-gateway` already in compose |
| Prometheus volume permissions on Linux (mounted dir owned by root) | Med | Med | `user: root` on prometheus service; volumes write fine |
| Port 9090 or 3000 already taken on dev box | Low | Med | Document override via `.env` (`PROMETHEUS_PORT=...`); deferred — not needed unless conflict reported |
| Service down causes Prometheus to mark target `DOWN`, no alert yet | Cert | Low | Acceptable — alerting added in Phase 3 |
| Compose YAML merge conflict if monitoring section misplaced | Low | High | Insert ABOVE the `volumes:` top-level key; do not modify existing services |
| Grafana container starts before Prometheus is up | Med | Low | `depends_on: prometheus: condition: service_healthy` |

## Security Considerations
- Grafana admin/admin acceptable in dev only — DO NOT deploy as-is. Document this in plan.
- Prometheus `--web.enable-lifecycle` allows `/-/reload` and `/-/quit` POSTs without auth. Acceptable on local; restrict at firewall in prod.
- No actuator-side auth needed for dev (consistent with existing `app.public-paths` config).
- Grafana anonymous access disabled (`GF_AUTH_ANONYMOUS_ENABLED=false`).

## Next Steps
- Phase 3 (`phase-03-dashboards-alerts.md`) — drop dashboard JSONs into `BE/monitoring/grafana/dashboards/`, add alert rules to `BE/monitoring/prometheus/rules/`, optionally wire alertmanager.
