# E-Commerce + Logistics Platform — Project Changelog

All notable changes to this project are documented here.

**Format:** Based on [Keep a Changelog](https://keepachangelog.com/), with semantic versioning.

---

## Unreleased

### Planned for Phase 9
- Performance tuning (APM, query optimization, caching strategies)
- Reliability improvements (circuit breakers, retry policies, DLQ)
- Security hardening (rate limiting, CORS whitelist, API key rotation)
- Enhanced testing (e2e tests, performance testing, chaos engineering)
- Observability enhancements (distributed tracing, custom metrics)

---

## [v1.1] — 2026-05-18

### Added
- **Phase 8.5: Data Studio & Analytics Module**
  - `analytics-executor` FastAPI service for SQL/Python/R execution
    - DuckDB for SQL queries on MinIO Parquet files
    - Sandboxed Python execution with pandas/numpy/scipy
    - R subprocess execution with timeout protection
  - `analytics-service` Spring Boot orchestrator (port 8087)
    - JWT authentication and admin-only authorization (X-User-Role: ADMIN)
    - Per-user rate limiting (Redis-backed, 100 req/min default)
    - Query result caching (Redis, 5-min TTL)
    - Query history tracking (PostgreSQL `analytics_metadata` schema)
    - Dataset catalog management (row count, size, schema)
  - Frontend Data Studio page (`/admin/data-studio`)
    - Monaco Editor for SQL/Python/R code editing
    - Dataset browser sidebar with Parquet file listing
    - Results visualization (table view with pagination + chart generation)
    - Query history panel with previous queries
    - CSV export functionality
  - Infrastructure updates
    - Added `analytics-executor` service to Docker Compose
    - Added `analytics-service` Maven module to backend
    - MinIO bucket `analytics-data` for Parquet storage
    - PostgreSQL schema `analytics_metadata` for catalog tracking
    - API Gateway route `/api/v1/analytics/**` → analytics-service
  - Data pipeline (scheduled daily export)
    - Automated Parquet export from PostgreSQL tables to MinIO
    - Daily execution at 02:00 UTC via Spring `@Scheduled`
    - Exports: `orders`, `order_items`, `products`, `users`, `inventory_items`
    - Automatic dataset catalog updates

### Changed
- Updated `FE/src/App.tsx` with `/admin/data-studio` route
- Updated `FE/src/components/layout/AdminLayout.tsx` with "Thống kê dữ liệu" (Data Analytics) nav item
- Updated `BE/api-gateway/src/main/resources/application.yml` to route `/analytics/**`
- Updated `BE/pom.xml` with `analytics-service` module dependency

### Documentation
- System architecture diagram updated with analytics services
- Project roadmap updated with Phase 8.5 completion
- Service responsibilities table expanded to include analytics services

---

## [v1.0] — 2026-05-12

### Added
- **Phase 8: Advanced Features & Polish**
  - Flash sales with time-based promotions and automatic discount application
  - Live chat with WebSocket support (user ↔ admin/bot interactions)
  - Configurable chat bot responses
  - Admin dashboard (orders, inventory, users management)
  - Grafana analytics dashboard with Prometheus metrics
  - Real-time order tracking with shipment updates
  - Comprehensive API documentation (Swagger/OpenAPI)
  - Full test coverage for critical paths

### Release Notes
- **Status:** Production-ready (v1.0)
- **Stability:** Mature microservices system
- **Deployment:** Docker Compose (dev), Kubernetes (prod)
- **Tested:** All phases 1-8 complete with passing test suite

---

## [v0.8] — 2026-04-15

### Added
- **Phase 6: Inventory & Fulfillment**
  - Stock management per warehouse
  - Distributed inventory reservations with Redis locks
  - FulfillmentTask creation from orders
  - Picking & packing workflow with real-time WebSocket updates
  - Warehouse staff assignment and SLA tracking
- **Phase 7: Delivery & Logistics**
  - Shipment creation and tracking
  - GHN carrier API integration
  - GHTK carrier API integration
  - Real-time delivery status notifications
  - Estimated delivery time tracking
  - Shipment history and audit logs

---

## [v0.5] — 2026-02-28

### Added
- **Phase 4: Product Catalog & Search**
  - Product CRUD operations with SKU variants
  - Elasticsearch full-text search with autocomplete
  - Category hierarchy (parent/child relationships)
  - Product reviews with 1-5 star ratings
  - Review aggregation and summary
  - Product image upload to MinIO
- **Phase 5: Shopping & Checkout**
  - Shopping cart (Redis-backed, 7-day TTL)
  - Cart persistence across sessions
  - Address selection during checkout
  - Automatic shipping fee calculation
  - Order creation with state machine
  - VNPay payment gateway integration
  - Payment status tracking and confirmations
  - Order confirmation emails

---

## [v0.1] — 2026-01-15

### Added
- **Phase 1-2: Foundation & Architecture**
  - 7 microservices project structure with shared library
  - Spring Cloud Gateway with JWT authentication
  - PostgreSQL 16 with Flyway migrations
  - Redis 7 for caching and sessions
  - Kafka 7.6 event streaming (9 topics)
  - Elasticsearch 8.13 for product search
  - MinIO S3-compatible object storage
  - Docker Compose multi-service stack
  - GitHub Actions CI/CD pipeline
- **Phase 3: User Management**
  - User registration with email verification
  - JWT authentication (15min access, 7day refresh tokens)
  - OAuth2 Google integration
  - User profile management
  - Address management (multiple addresses, defaults)
  - Role-based access control (CUSTOMER, ADMIN, STAFF, DRIVER)
  - OTP forgot-password recovery
  - Email notifications

### Infrastructure
- All services containerized with Docker
- Local development via Docker Compose
- Production-ready Kubernetes manifests
- Flyway database migrations (automatic on startup)

---

## Known Issues & Fixed

### Fixed in v1.1
- None (new module)

### Known Limitations in Analytics Module
- Python sandbox execution uses subprocess (not fully isolated; use K8S Jobs in production)
- R execution requires R runtime in container (optional, disabled by default)
- Query timeout default: 30 seconds (configurable per request)
- Parquet export schema inference only on first run (manual refresh available)

---

## Dependencies

### External Services
- PostgreSQL 16+
- Redis 7+
- Kafka 7.6+
- Elasticsearch 8.13+
- MinIO (S3-compatible)
- DuckDB (analytics-executor)
- FastAPI 0.104+ (analytics-executor)
- Spring Boot 3.2+ (all services)

### Required Accounts
- VNPay Sandbox (payments)
- GHN/GHTK API keys (delivery)
- Email service provider (notifications)
- OAuth2 Google credentials (social login)

---

## Migration Guide

### v1.0 → v1.1
- No breaking changes
- New services added: `analytics-executor`, `analytics-service`
- New schema: `analytics_metadata` (auto-created via Flyway)
- New MinIO bucket: `analytics-data` (auto-created on startup)
- New API route: `/api/v1/analytics/**` (admin-only, requires ADMIN role)

**Upgrade Steps:**
1. Pull latest code
2. Run `docker-compose up -d` (new services auto-start)
3. Flyway migrations applied automatically
4. MinIO bucket initialized automatically
5. Restart frontend to pick up new routes

---

## Contributors

- Backend: Spring Boot microservices team
- Frontend: React + TypeScript team
- DevOps: Kubernetes and Docker infrastructure
- QA: Comprehensive test coverage

---

## License

Private project. All rights reserved.

---

**Last Updated:** 2026-05-18
**Next Review:** 2026-06-18
