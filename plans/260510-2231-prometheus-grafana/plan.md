---
title: "Prometheus + Grafana monitoring for Spring Boot microservices"
description: "Add operational visibility (JVM, HTTP, Kafka/Redis) across 7 services via actuator/micrometer, scraped by Prometheus, visualized in Grafana, with basic alerts."
status: pending
priority: P2
effort: 6h
branch: main
tags: [observability, prometheus, grafana, monitoring, spring-boot, docker-compose]
created: 2026-05-10
---

# Prometheus + Grafana Monitoring

## Goal
Add basic operational visibility for 7 Spring Boot 3.3 services via Prometheus scrapes of `/actuator/prometheus`, with Grafana dashboards for JVM and Spring Boot HTTP metrics, plus rudimentary alerts (service down, high error rate, JVM memory).

## Scope decisions (YAGNI/KISS)
- No tracing (Tempo/Jaeger) — out of scope.
- No log aggregation (Loki/ELK) — Kibana already exists for Elasticsearch logs separately.
- No exporters for postgres/redis/kafka in phase 1 — only JVM + HTTP first; revisit if blind spots appear.
- Single-node docker-compose; **no** HA, no remote-write, no long-term storage. 15-day retention default.
- Services run on **host** (not containers) — Prometheus scrapes via `host.docker.internal:<port>`.
- Alertmanager included only if Phase 3 demand confirms — gated behind explicit alert rule additions.

## Discovered state (preflight)
- Actuator dep present in: `api-gateway`, `user-service`, `order-service`, `product-service` (4/7).
- Actuator dep MISSING in: `inventory-service`, `fulfillment-service`, `delivery-service` (3/7).
- Micrometer Prometheus registry: missing in ALL 7.
- `management.endpoints.web.exposure.include` present in: `api-gateway` (health,info,metrics), `order-service` (health,info,metrics), `product-service` (assumed similar). MISSING in `user-service`, and the 3 above.
- API gateway is reactive (Spring Cloud Gateway) — needs `micrometer-registry-prometheus` (works with WebFlux).
- Frontend (React/Vite) not in scope.

## Phases

| # | File | Owner | Effort | Status | Blocker |
|---|------|-------|--------|--------|---------|
| 1 | [phase-01-spring-actuator.md](./phase-01-spring-actuator.md) | Backend dev | 2h | pending | none |
| 2 | [phase-02-docker-monitoring-stack.md](./phase-02-docker-monitoring-stack.md) | Backend dev | 2h | pending | Phase 1 |
| 3 | [phase-03-dashboards-alerts.md](./phase-03-dashboards-alerts.md) | Backend dev | 2h | pending | Phase 2 |

## Dependency graph
```
Phase 1 (instrument apps) ─► Phase 2 (scrape stack) ─► Phase 3 (dashboards + alerts)
```
No parallelism — strictly sequential. Phase 2 cannot validate without Phase 1 endpoints; Phase 3 dashboards need Phase 2 datasource.

## File ownership (no overlap)
- Phase 1: `BE/{7 services}/pom.xml`, `BE/{7 services}/src/main/resources/application.yml`
- Phase 2: `BE/docker-compose.yml` (additions only), `BE/monitoring/prometheus/**`, `BE/monitoring/grafana/provisioning/**`
- Phase 3: `BE/monitoring/grafana/dashboards/**`, `BE/monitoring/prometheus/rules/**`, `BE/monitoring/alertmanager/**` (optional)

## Rollback plan
- Phase 1: revert pom.xml dep + remove `management:` block; actuator endpoints disappear cleanly. No data migration.
- Phase 2: `docker compose down prometheus grafana` and remove `BE/monitoring/`. Existing services unaffected.
- Phase 3: delete dashboard JSON / rules YAML; restart prometheus + grafana. App side untouched.

## Success criteria (measurable)
- `curl http://localhost:<port>/actuator/prometheus` returns text-format metrics for ALL 7 services.
- Prometheus targets page (`http://localhost:9090/targets`) shows 7 services with state `UP`.
- Grafana (`http://localhost:3000`, admin/admin) shows JVM + Spring Boot dashboards with live data within 60s of restart.
- Alert "ServiceDown" triggers within 2min of stopping a service (verified via UI or alertmanager).

## Unresolved questions
- Should `/actuator/prometheus` be auth-protected? Currently open via `/actuator/**` in gateway public-paths. Acceptable for dev; harden before prod.
- Grafana persistence (`grafana_data` volume) — keep or use ephemeral? Plan assumes volume for dashboard edits to survive restarts.
- Do we need Postgres/Redis/Kafka exporters now? Plan says no; revisit if dashboards reveal blind spots.
