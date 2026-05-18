# Phase 03 — Grafana Dashboards + Prometheus Alert Rules

## Context Links
- [plan.md](./plan.md)
- [phase-01-spring-actuator.md](./phase-01-spring-actuator.md)
- [phase-02-docker-monitoring-stack.md](./phase-02-docker-monitoring-stack.md) (BLOCKER)

## Overview
- Priority: P2
- Status: pending
- Provision pre-built Grafana dashboards (JVM, Spring Boot HTTP) and add Prometheus alerting rules for service-down / high-error / JVM memory pressure. Optionally wire alertmanager (gated — only if alerts deemed valuable).

## Key Insights
- Use community-maintained Grafana dashboards from grafana.com (don't reinvent):
  - **JVM (Micrometer)** — ID 4701 (covers heap, GC, threads).
  - **Spring Boot Statistics** — ID 6756 (HTTP throughput, percentiles, error rates).
  - Optional: **Spring Boot 2.1 Statistics** — ID 10280 (alt with Tomcat metrics).
- Provisioned dashboards must reference datasource by `${DS_PROMETHEUS}` variable; Grafana resolves to "Prometheus" datasource auto-provisioned in Phase 2.
- Alert rules live in Prometheus (not Grafana), evaluated every 15s. Triggered alerts shown on `:9090/alerts` page; routing/notifications need alertmanager.
- KISS: start with **3 essential alerts**. No PagerDuty/Slack integration — UI-only first; user can add receiver config when value proven.

## Requirements

### Functional
- 2 dashboards visible in Grafana under default folder: "JVM (Micrometer)" and "Spring Boot Statistics".
- Both dashboards have `application` (or `service`) variable to filter per-service.
- 3 alert rules registered in Prometheus, visible on `/alerts` page.
- Alert "ServiceDown" fires within 2min when a service is stopped.

### Non-functional
- Dashboard JSONs versioned in repo (no manual UI edits drift away from source).
- Alert rules are valid YAML and pass `promtool check rules`.

## Architecture

### Provisioning flow
```
BE/monitoring/grafana/dashboards/*.json ─► volume mount ─► /var/lib/grafana/dashboards
                                                                  │
                                                          dashboards.yml provider
                                                                  │
                                                                  ▼
                                                       Grafana UI (auto-loaded)
```
```
BE/monitoring/prometheus/rules/*.yml ─► volume mount ─► /etc/prometheus/rules/
                                                              │
                                                  prometheus.yml `rule_files:`
                                                              │
                                                              ▼
                                                  Prometheus rule evaluator
```

### Alert taxonomy (3 rules)
| Alert | Expression | For | Severity |
|-------|-----------|-----|----------|
| `ServiceDown` | `up{job="spring-services"} == 0` | 1m | critical |
| `HighHttp5xxRate` | `sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m])) by (service) / sum(rate(http_server_requests_seconds_count[5m])) by (service) > 0.05` | 5m | warning |
| `JvmHeapNearLimit` | `jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"} > 0.9` | 10m | warning |

## Related Code Files

### To MODIFY
- `BE/monitoring/prometheus/prometheus.yml` — uncomment `rule_files:` block.

### To CREATE
- `BE/monitoring/grafana/dashboards/jvm-micrometer.json` (Grafana ID 4701 export)
- `BE/monitoring/grafana/dashboards/spring-boot-statistics.json` (Grafana ID 6756 export)
- `BE/monitoring/prometheus/rules/service-health.yml` (3 alerts)
- `BE/monitoring/alertmanager/alertmanager.yml` (OPTIONAL — only if user opts in)

### To DELETE
- None.

## Implementation Steps

### 1. Download community dashboard JSONs
From grafana.com (or use the manual export):
```powershell
# Download JSON for ID 4701
curl -o BE/monitoring/grafana/dashboards/jvm-micrometer.json `
  "https://grafana.com/api/dashboards/4701/revisions/latest/download"

# Download JSON for ID 6756
curl -o BE/monitoring/grafana/dashboards/spring-boot-statistics.json `
  "https://grafana.com/api/dashboards/6756/revisions/latest/download"
```
After download, edit each file: ensure `__inputs[0].name == "DS_PROMETHEUS"` and replace any literal datasource UID with `"${DS_PROMETHEUS}"`. (Grafana 11 typically resolves automatically when only one Prometheus DS exists.)

### 2. Verify dashboards load
```powershell
docker compose restart grafana
# Wait 30s
# Browse http://localhost:3000/dashboards — see "JVM (Micrometer)" and "Spring Boot Statistics"
```
Open each, select `application` variable → all 7 service names visible. Heap, GC, request rate panels show data.

### 3. Create alert rules `BE/monitoring/prometheus/rules/service-health.yml`
```yaml
groups:
  - name: spring-services
    interval: 15s
    rules:
      - alert: ServiceDown
        expr: up{job="spring-services"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.service }} is DOWN"
          description: "Prometheus has been unable to scrape {{ $labels.service }} ({{ $labels.instance }}) for 1 minute."

      - alert: HighHttp5xxRate
        expr: |
          sum by (service) (rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            /
          sum by (service) (rate(http_server_requests_seconds_count[5m]))
          > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.service }} 5xx error rate > 5%"
          description: "{{ $labels.service }} has been returning >5% 5xx responses over the last 5 minutes."

      - alert: JvmHeapNearLimit
        expr: |
          jvm_memory_used_bytes{area="heap"}
            /
          jvm_memory_max_bytes{area="heap"}
          > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.application }} JVM heap >90% used"
          description: "{{ $labels.application }} ({{ $labels.id }}) heap usage above 90% for 10 minutes — risk of OutOfMemoryError."
```

### 4. Enable rule loading in `BE/monitoring/prometheus/prometheus.yml`
Uncomment the `rule_files:` block:
```yaml
rule_files:
  - /etc/prometheus/rules/*.yml
```

### 5. Reload Prometheus (no container restart needed)
```powershell
curl -X POST http://localhost:9090/-/reload
```

### 6. Verify rules
- Browse `http://localhost:9090/rules` — see 3 rules listed under `spring-services` group, all "ok".
- Browse `http://localhost:9090/alerts` — see 3 alerts, all in `inactive` state initially.

### 7. Validate ServiceDown alert
Stop one service, e.g. `delivery-service` (kill its java process). Wait ~75s.
- `/alerts` page shows `ServiceDown` in `pending` then `firing` state with `service="delivery-service"` label.
- Restart service → alert returns to `inactive` within next eval cycle.

### 8. (OPTIONAL) Alertmanager — only if user explicitly opts in
Skip by default. If proceeding:

Create `BE/monitoring/alertmanager/alertmanager.yml`:
```yaml
global:
  resolve_timeout: 5m
route:
  receiver: 'default'
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
receivers:
  - name: 'default'
    # No webhook/email/slack — UI-only. Add receivers when value proven.
```

Append to `BE/docker-compose.yml`:
```yaml
  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: ecommerce-alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager:/etc/alertmanager
      - alertmanager_data:/alertmanager
    restart: unless-stopped
```

Append to volumes:
```yaml
  alertmanager_data:
    driver: local
```

Update `prometheus.yml` to add alertmanager target:
```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

Reload prometheus, confirm `http://localhost:9093` shows alerts when triggered.

## Todo List

- [ ] Download `jvm-micrometer.json` (ID 4701) into `BE/monitoring/grafana/dashboards/`
- [ ] Download `spring-boot-statistics.json` (ID 6756) into `BE/monitoring/grafana/dashboards/`
- [ ] Restart grafana, verify both dashboards visible & populated
- [ ] Create `BE/monitoring/prometheus/rules/service-health.yml` with 3 alert rules
- [ ] Uncomment `rule_files:` in `prometheus.yml`
- [ ] Reload prometheus via `/-/reload`, confirm rules listed on `/rules` page
- [ ] Stop one service to verify `ServiceDown` fires within 2min, then resolves on restart
- [ ] (OPTIONAL) Add alertmanager container if user wants notification grouping/routing

## Success Criteria
- Both dashboards render with data and have working `application` variable filter.
- `/rules` shows 3 rules, all in `ok` state.
- Stopping `delivery-service` makes `ServiceDown{service="delivery-service"}` fire within 2 min.
- All alert expressions parse — `docker run --rm -v ./BE/monitoring/prometheus/rules:/rules prom/prometheus:v2.54.1 promtool check rules /rules/service-health.yml` returns "SUCCESS".

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Community dashboards reference outdated metric names (e.g. `http_server_requests_seconds_count` vs older `_total`) | Med | Med | Spring Boot 3 + Micrometer 1.13 uses `seconds_count`; ID 6756 latest revision compatible. If panels empty, edit dashboard query directly |
| Dashboard JSONs huge (>100KB) clutter repo | Cert | Low | Acceptable — keeps stack reproducible; alternative (manual import) is worse |
| `HighHttp5xxRate` flaps when service has near-zero traffic (denominator tiny) | Med | Low | `for: 5m` smooths short bursts; division-by-zero yields no series, no alert. Acceptable |
| `JvmHeapNearLimit` cardinality (per-pool series) noisy | Low | Low | `for: 10m` filters short spikes; aggregation by `application` happens at alert read time |
| Reload via `/-/reload` returns 200 but rules silently fail to load | Low | Med | Always check `/rules` page after reload; CI step `promtool check rules` before commit |
| Alertmanager added with no receiver = silent black hole | Med | Med | Phase 3 step 8 explicitly notes "UI-only" intent; user must consciously add receivers |

## Security Considerations
- Grafana dashboards are read-only for anonymous (anon disabled in Phase 2). Editors require admin login.
- Alert rule files mounted read-only in Prometheus (default) — no runtime modification possible from container.
- Alertmanager (if added) has no auth on `:9093` — restrict at firewall before exposing beyond localhost.
- No PII in alert annotations (only service names, labels).

## Next Steps
- Iterate dashboards based on real incident retrospectives — add custom panels for business metrics (orders/min, inventory reservation success rate) once Phase 1 custom Micrometer counters exist.
- Consider Postgres exporter (`prometheus-postgres-exporter`), Redis exporter, Kafka JMX exporter when SLO/SLI work begins.
- Wire Alertmanager → Slack/email/PagerDuty when on-call rotation is established.
