# E-Commerce + Logistics Platform — Project Overview & PDR

## Problem Statement

Vietnam's e-commerce market requires an integrated, scalable platform that combines:
1. Online shopping experience with product discovery, ordering, and payment
2. Real-time inventory visibility across multiple warehouses
3. Unified fulfillment and last-mile delivery coordination
4. Customer engagement (reviews, flash sales, live chat support)
5. Data-driven insights for analytics and optimization

**Current Gaps:**
- Fragmented systems (separate e-commerce, inventory, shipping platforms)
- No real-time order tracking or inventory visibility
- Manual fulfillment processes prone to errors
- Limited customer communication channels
- Inability to run coordinated promotions (flash sales)

## Solution Overview

**E-Commerce + Logistics Platform** — A cloud-native microservices system providing:
- **Unified Storefront** (React 18 + TypeScript) for product browsing, cart, checkout
- **Microservices Backend** (Java Spring Boot 3.x) handling users, orders, inventory, fulfillment, delivery
- **Event-Driven Architecture** (Kafka) ensuring real-time state synchronization
- **Scalable Infrastructure** (PostgreSQL, Redis, Elasticsearch) for performance and reliability
- **Integrated Logistics** (GHN + GHTK carrier APIs) for last-mile delivery
- **Payment Gateway** (VNPay) for Vietnamese market transactions

---

## Functional Requirements

### 1. User Management & Authentication

| Requirement | Details |
|-------------|---------|
| **User Registration** | Email + password; welcome email verification |
| **Login/Logout** | JWT tokens (15min access, 7day refresh); OAuth2 Google |
| **Profile Management** | View/edit full name, phone, email; change password |
| **Addresses** | Multiple shipping addresses with default selection; geocoding (lat/lng) |
| **Roles** | CUSTOMER, ADMIN, STAFF, DRIVER (role-based features) |
| **OTP Verification** | 6-digit codes (5min TTL) for forgot-password recovery |

### 2. Product Catalog & Search

| Requirement | Details |
|-------------|---------|
| **Product CRUD** | Create, read, update, delete products with variants (SKUs) |
| **Categorization** | Hierarchical categories with parent/child relationships |
| **SKU Management** | Variant attributes (size, color, etc.), separate pricing per SKU |
| **Search** | Elasticsearch-powered full-text search with filters (category, price, brand) |
| **Autocomplete** | Real-time product suggestions as user types |
| **Product Images** | Upload via MinIO; multi-image support per product |
| **Reviews & Ratings** | 1-5 star ratings with comments; review summary per product |

### 3. Shopping & Checkout

| Requirement | Details |
|-------------|---------|
| **Shopping Cart** | Redis-backed, 7-day expiry; add/remove items by SKU ID |
| **Cart Persistence** | Cart saved across sessions for authenticated users |
| **Quantity Management** | Increase/decrease quantities; validate against stock |
| **Address Selection** | Choose from saved addresses or add new |
| **Shipping Calculation** | Automatic fee based on destination + weight |
| **Discount Application** | Flash sale pricing automatically applied to eligible items |
| **Order Placement** | Atomic creation; reserves inventory via Kafka event |
| **Payment** | VNPay integration; multiple payment methods |

### 4. Order Management

| Requirement | Details |
|-------------|---------|
| **Order Tracking** | Real-time status updates (PENDING → DELIVERED); WebSocket notifications |
| **Order State Machine** | Managed by Spring State Machine; prevents invalid transitions |
| **Order Cancellation** | Allowed before CONFIRMED; refund logic |
| **Order History** | Paginated list of past orders with search/filter |
| **Order Details** | Items, pricing breakdown, shipping address, payment status, tracking URL |
| **Notification** | Email + SMS on status changes (ordered, shipped, delivered) |

### 5. Inventory & Fulfillment

| Requirement | Details |
|-------------|---------|
| **Stock Management** | Per-warehouse stock levels with safety thresholds |
| **Reservations** | Distributed locking (Redis) to prevent overselling |
| **Stock Adjustment** | Admin ability to adjust inventory for corrections |
| **Fulfillment Tasks** | Auto-created from orders; assigned to warehouse staff |
| **Picking & Packing** | Workflow status tracking (PENDING → PACKED) |
| **Warehouse Allocation** | Automatic assignment to nearest/optimal warehouse |

### 6. Delivery & Logistics

| Requirement | Details |
|-------------|---------|
| **Shipment Creation** | Auto-created after packing; linked to order |
| **Carrier Integration** | GHN + GHTK API calls for shipment tracking |
| **Real-time Tracking** | External carrier tracking pulled and displayed to customer |
| **SLA Monitoring** | Estimated delivery time tracking; alerts if delayed |
| **Route Optimization** | Placeholder for future ML-based optimization |

### 7. Flash Sales & Promotions

| Requirement | Details |
|-------------|---------|
| **Flash Sale Creation** | Time-bounded sales with discount rules (% or fixed amount) |
| **Quantity Quotas** | Per-item limits; sold count tracking |
| **Automatic Pricing** | Sale price replaces base price in cart + checkout |
| **Admin Control** | Create, edit, activate, deactivate sales |
| **Event Publishing** | Kafka events for activation/completion |

### 8. Customer Communication

| Requirement | Details |
|-------------|---------|
| **Live Chat** | WebSocket-based real-time messaging |
| **Chat Rooms** | Per-order or user support tickets; escalation to admin |
| **Bot Support** | Configurable chat bot with pre-written responses |
| **Notifications** | Order/delivery updates via email; real-time via WebSocket |

### 9. Admin Dashboard

| Requirement | Details |
|-------------|---------|
| **Order Management** | View all orders; filter, search, bulk actions |
| **Inventory Dashboard** | Stock levels per warehouse; low stock alerts |
| **User Management** | View users, assign roles, enable/disable accounts |
| **Analytics** | Order count, revenue, popular products, top customers |
| **Flash Sale Management** | Create/edit/cancel promotions |
| **Chat Moderation** | View conversations; escalate or respond |

---

## Non-Functional Requirements

### Performance
- **API response latency:** <200ms for 95th percentile
- **Search latency:** <100ms (Elasticsearch)
- **Cart operations:** <50ms (Redis-backed)
- **Concurrent users:** Support 10,000+ simultaneous active users
- **Peak transactions:** Handle 1,000 orders/minute during flash sales

### Scalability
- **Horizontal scaling:** Stateless microservices behind load balancer
- **Database:** Read replicas for analytics; write to primary
- **Caching:** Redis for sessions, cart, product data (30-day TTL configurable)
- **Search:** Elasticsearch with daily index rotation
- **Storage:** MinIO scales to multi-petabyte; distributed setup in production

### Reliability & Resilience
- **API uptime:** 99.9% SLA (8.6 hours/month downtime allowed)
- **Database failover:** Automated replication + backups
- **Circuit breakers:** Polly patterns for external service calls (VNPay, carriers)
- **Event replication:** Kafka retention 7 days; no message loss
- **Graceful degradation:** Elasticsearch down → fallback to DB search

### Security
- **Authentication:** JWT (HMAC-SHA256) + OAuth2 (Google)
- **Authorization:** Role-based access control (RBAC) per endpoint
- **Data encryption:** HTTPS in transit; PII encrypted at rest (future)
- **API rate limiting:** Per-user + per-IP throttling
- **SQL injection prevention:** Parameterized queries (Spring Data JPA)
- **CORS:** Configured to allow frontend domain only
- **Password hashing:** BCrypt with salt
- **Payment security:** PCI compliance via VNPay tokenization

### Maintainability
- **Code organization:** Layered microservices architecture
- **Documentation:** API docs (Swagger), code standards, deployment guides
- **Logging:** Structured logs (SLF4J) with correlation IDs across services
- **Monitoring:** Prometheus metrics, Grafana dashboards, alerts
- **Testing:** Unit tests (JUnit 5), integration tests (Testcontainers)
- **Version control:** Git with conventional commits
- **Database migrations:** Flyway auto-applied on startup

### Accessibility
- **API documentation:** Swagger/OpenAPI at `/swagger-ui.html`
- **Frontend i18n:** Vietnamese + English languages
- **Mobile responsive:** React UI adapts to all screen sizes
- **WCAG 2.1 compliance:** Accessible to users with disabilities

---

## Acceptance Criteria

### Phase 1-2: Foundation (Complete)
- [x] Microservices architecture deployed (7 services)
- [x] PostgreSQL schema with Flyway migrations
- [x] API Gateway with JWT auth + CORS
- [x] User service (registration, login, profiles, addresses)
- [x] Product service (CRUD, categories, SKUs)

### Phase 3: Shopping & Orders
- [x] Shopping cart (Redis-backed)
- [x] Order creation + state machine
- [x] Checkout flow
- [x] Payment integration (VNPay)
- [x] Order tracking + notifications

### Phase 4: Inventory & Fulfillment
- [x] Stock management with reservations
- [x] Fulfillment task workflow
- [x] Warehouse assignment

### Phase 5: Delivery & Logistics
- [x] Shipment creation + tracking
- [x] Carrier API integration (GHN, GHTK)
- [x] Real-time tracking display

### Phase 6: Advanced Features
- [x] Flash sales with time-based promotions
- [x] Product reviews + ratings
- [x] Live chat + bot support

### Phase 7: Admin & Analytics
- [x] Admin dashboard with order/inventory/user management
- [x] Analytics dashboards (Grafana)
- [x] Email notifications

### Phase 8: Polish & Scale
- [x] Performance optimization
- [x] Comprehensive testing (unit + integration)
- [x] Documentation (API, architecture, deployment)
- [x] Load testing + tuning

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API uptime** | 99.9% | Prometheus + alerting |
| **P95 API latency** | <200ms | APM tracing |
| **Search latency (P95)** | <100ms | Elasticsearch metrics |
| **Peak transaction throughput** | 1,000 orders/min | Load testing |
| **Concurrent active users** | 10,000+ | Server metrics |
| **Test coverage** | ≥70% | xUnit/Jacoco reports |
| **Deployment frequency** | 2+ per week | Git logs |
| **MTTR (mean time to recovery)** | <15 minutes | Incident tracking |
| **Cart abandonment rate** | <60% | Business analytics |
| **Order error rate** | <0.1% | App logs + auditing |

---

## Technical Constraints

### Technology Stack
- **Java 17+** — minimum runtime
- **Spring Boot 3.x** — framework (Spring Framework 6.x required)
- **PostgreSQL 16** — primary database (v14+ compatible)
- **Redis 7** — caching + sessions (v6.x compatible)
- **Kafka 7.6.0** — event streaming
- **Elasticsearch 8.13** — search engine
- **React 18.3.1+** — frontend framework
- **Vite 6.4.2+** — frontend build tool

### Infrastructure Requirements
- **Docker** — containerization (v20+ for Compose v3.8)
- **Kubernetes** — (optional) orchestration for production
- **Cloud storage** — MinIO or AWS S3 for images
- **CDN** — (optional) CloudFront or Cloudflare for static assets

### Data Constraints
- **Max file upload** — 50MB per image
- **Database connections** — 200 per service (configurable)
- **Kafka partition count** — 3 per topic (configurable for scale)
- **Elasticsearch shards** — 2 primary + 1 replica per index

---

## Out of Scope (Future Phases)

| Feature | Reason for Deferral | Estimated Phase |
|---------|---------------------|-----------------|
| **Push notifications** | Mobile apps not in Phase 1-8 | Phase 9+ |
| **ML-based recommendations** | ML pipeline requires data collection | Phase 10+ |
| **Advanced analytics** | Business intelligence tools (BI) not initially needed | Phase 9+ |
| **Multi-currency support** | Vietnamese Dong sufficient for MVP | Phase 10+ |
| **Subscription models** | B2B feature for future expansion | Phase 10+ |
| **Marketplace (seller onboarding)** | Requires seller portal + vetting | Phase 10+ |
| **Blockchain/Web3 integration** | No current business requirement | Phase 11+ |

---

## Constraints & Dependencies

### Technical Dependencies
- **Spring Security** — authentication/authorization library (included in Spring Boot)
- **Spring Cloud Gateway** — API gateway (Hoxton RC1+)
- **Kafka clients** — org.apache.kafka:kafka-clients (v3.6+)
- **Elasticsearch Java client** — official Java API client (v8.x)
- **VNPay SDK** — Vietnamese payment gateway (custom or vendor-provided)
- **Carrier SDKs** — GHN + GHTK APIs (REST-based, no official Java SDK)

### Organizational Dependencies
- **Development team** — backend (Java), frontend (React/TypeScript), DevOps
- **Infrastructure** — cloud provider (AWS, Azure, GCP) or on-prem data center
- **Database admins** — for PostgreSQL setup, backups, replication
- **VNPay merchant account** — payment processing
- **GHN + GHTK accounts** — logistics partner integrations

### Timeline Assumptions
- All infrastructure (databases, Kafka, etc.) provisioned before Phase 1
- Team available 2-4 developers per service
- No major vendor delays (VNPay, carrier integrations)
- Feature scope locked at start of each phase

---

## Versioning & Changelog

**Current Version:** 1.0 (Phase 8 complete, in production)

**Release Schedule:**
- Phase 1-2 (Auth, Products): v0.1 (internal alpha)
- Phase 3 (Orders, Payments): v0.5 (beta)
- Phase 4-5 (Inventory, Delivery): v0.8 (release candidate)
- Phase 6 (Flash Sales, Chat): v1.0 (production release)
- Phase 7-8 (Admin, Polish): v1.0.1 (maintenance release)
- Phase 9+ (Advanced features): v1.1+ (roadmap)

See [Project Roadmap](./project-roadmap.md) for detailed milestones and [Project Changelog](./project-changelog.md) for release notes.

---

## Design Principles

1. **Microservices-First** — Independent deployment, clear boundaries
2. **Event-Driven** — Kafka for inter-service communication (loose coupling)
3. **CQRS Pattern** — Separation of reads (Elasticsearch) and writes (PostgreSQL)
4. **Fail-Safe Defaults** — Assume external services may fail; graceful degradation
5. **Observable** — Structured logging, metrics, tracing across services
6. **Secure by Default** — JWT auth, RBAC, encrypted secrets (not in code)
7. **Developer Experience** — Clear docs, fast local setup, helpful error messages

---

## Business Value

### For Customers
- **Seamless shopping experience** — Fast search, easy checkout, multiple payments
- **Real-time tracking** — Know exactly where their order is
- **Responsive support** — Live chat with bot + human escalation
- **Flash deals** — Exclusive limited-time offers with transparent pricing

### For Operations
- **Inventory visibility** — Real-time stock across warehouses
- **Automated fulfillment** — Reduces manual picking errors
- **Carrier optimization** — Integrated shipping with cost comparison
- **Analytics** — Data-driven insights on sales, inventory, customer behavior

### For Business
- **Scalable revenue** — Handle millions of transactions without downtime
- **Reduced costs** — Automation + efficiency gains in fulfillment + logistics
- **Competitive advantage** — Modern tech stack enables rapid feature iteration
- **Market expansion** — Platform supports multi-warehouse + multi-carrier growth

---

## Review & Approval

**Document Version:** 1.0
**Last Updated:** 2026-05-12
**Status:** APPROVED
**Next Review:** When requirements change or new phases planned
