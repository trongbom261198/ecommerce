# E-Commerce + Logistics Platform — System Architecture

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                    │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │   Web Browser (React 18 SPA)                                   │    │
│  │   http://localhost:5173 (dev), http://app.example.com (prod)  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ HTTPS/WSS
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    API Gateway (Spring Cloud Gateway)                    │
│                         http://localhost:8080                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • JWT Token Validation                                          │   │
│  │ • Request Routing (to backend services)                         │   │
│  │ • CORS Header Management                                        │   │
│  │ • Rate Limiting (per-user, per-IP)                             │   │
│  │ • Request ID / Correlation ID generation                       │   │
│  │ • WebSocket upgrade (STOMP)                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────────────────┘
                     │ Routes to backend services
     ┌───────────────┼───────────────┬────────────────┬──────────┬──────────┐
     ▼               ▼               ▼                ▼          ▼          ▼
┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│user-service │ │product-      │ │order-       │ │inventory-│ │delivery- │ │analytics-    │
│  (8081)     │ │service       │ │service      │ │service   │ │service   │ │service       │
│             │ │ (8082)       │ │ (8083)      │ │ (8084)   │ │ (8086)   │ │ (8087)       │
└─────────────┘ └──────────────┘ └─────────────┘ └──────────┘ └──────────┘ └──────────────┘
     │               │               │                │          │               │
     │ fulfillment-service (8085)    │                │          │               │
     │                               │                │          │               │
     └───────────────────┬───────────┼────────────────┼──────────┘               │
                         │           │                │                          │
                         ▼           ▼                ▼                          │
               ┌─────────────────────────────────────────────┐                  │
               │      Shared Data Layer                      │                  │
               └─────────────────────────────────────────────┘                  │
                                                                                 │
                                                                    HTTP proxy
                                                                         │
                                                                         ▼
                                                                  ┌──────────────────┐
                                                                  │analytics-executor│
                                                                  │(FastAPI, port 8000)
                                                                  │ • DuckDB         │
                                                                  │ • Python sandbox │
                                                                  │ • R execution    │
                                                                  └──────────────────┘
               ┌─────────────────────────────────────────────┐
               │      Shared Data Layer                      │
               │  ┌───────────────────────────────────────┐  │
               │  │  PostgreSQL 16 (ecommerce DB)        │  │
               │  │  Flyway migrations (auto-applied)    │  │
               │  │  8+ tables, 20+ indexes              │  │
               │  └───────────────────────────────────────┘  │
               │  ┌───────────────────────────────────────┐  │
               │  │  Redis 7 (cache, sessions, locks)    │  │
               │  │  Cart: cart:{userId} (7-day TTL)     │  │
               │  │  Sessions: session:{sessionId}       │  │
               │  │  Locks: lock:inventory:{skuId}       │  │
               │  └───────────────────────────────────────┘  │
               │  ┌───────────────────────────────────────┐  │
               │  │  Kafka 7.6 (event streaming)         │  │
               │  │  9 topics, 3 partitions each         │  │
               │  │  7-day retention, AVRO schemas       │  │
               │  └───────────────────────────────────────┘  │
               │  ┌───────────────────────────────────────┐  │
               │  │  Elasticsearch 8.13 (search)         │  │
               │  │  ProductDocument index               │  │
               │  │  Daily rotation, 30-day retention    │  │
               │  └───────────────────────────────────────┘  │
               │  ┌───────────────────────────────────────┐  │
               │  │  MinIO (image storage)               │  │
               │  │  Per-service buckets                 │  │
               │  │  S3-compatible API                   │  │
               │  └───────────────────────────────────────┘  │
               └─────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                      Monitoring & Observability                           │
│  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Prometheus (9090)   │  │  Grafana (3000)  │  │  ELK Stack       │  │
│  │  Metrics collection  │  │  Dashboards      │  │  Logs aggregation│  │
│  │  15s scrape interval │  │  (admin:admin)   │  │  Structured logs │  │
│  └──────────────────────┘  └──────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                        External Integrations                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  VNPay Gateway   │  │  GHN Carrier API │  │  GHTK Carrier API       │
│  │  Payment proc.   │  │  Shipment mgmt   │  │  Tracking & delivery    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└──────────────────────────────────────────────────────────────────────────┘
```

## Service Responsibilities

| Service | Port | Responsibility | Key Tables |
|---------|------|-----------------|------------|
| **user-service** | 8081 | Authentication, user profiles, addresses | User, Address, RefreshToken, UserIdentity |
| **product-service** | 8082 | Product catalog, search, reviews, categories | Product, Category, Sku, Review, ProductDocument (ES) |
| **order-service** | 8083 | Orders, cart, checkout, payments, flash sales, chat | Order, OrderItem, Payment, FlashSale, ChatRoom |
| **inventory-service** | 8084 | Stock management, warehouse allocation, reservations | Inventory, Warehouse, InventoryAuditLog |
| **fulfillment-service** | 8085 | Picking, packing, task assignment | FulfillmentTask, FulfillmentTaskItem |
| **delivery-service** | 8086 | Shipments, tracking, carrier integration | Shipment, ShipmentTracking |
| **analytics-service** | 8087 | Query orchestration, auth, rate-limiting, caching, dataset management | QueryHistory, DatasetCatalog |
| **analytics-executor** | 8000 | SQL/Python/R execution engine | (Stateless — uses MinIO + PostgreSQL) |

## Data Flow: Order Lifecycle

```
1. SHOPPING PHASE
┌──────────────────────────────────────────────────────────┐
│ User browses products (product-service: Elasticsearch)   │
│ Adds items to cart (Redis: cart:{userId})               │
│ Views cart, proceeds to checkout                         │
└──────────────────────────────────────────┬───────────────┘
                                           │
2. CHECKOUT PHASE
┌──────────────────────────────────────────▼───────────────┐
│ POST /api/v1/orders (order-service)                      │
│ ├─ Validate items against current inventory              │
│ ├─ Calculate total (items + shipping fee - discount)     │
│ ├─ Create Order entity (status: PENDING)                 │
│ ├─ Publish order.created event (Kafka)                   │
│ └─ Return orderId + payment redirect URL (VNPay)        │
└──────────────────────────────────────────┬───────────────┘
                                           │
3. PAYMENT PHASE
┌──────────────────────────────────────────▼───────────────┐
│ User redirected to VNPay payment gateway                 │
│ Returns to /payment-result?code=xxx&orderId=xxx          │
│ POST /api/v1/payments/vnpay/return                       │
│ ├─ Verify VNPay signature (HMAC-SHA512)                  │
│ ├─ Create Payment entity (status: CONFIRMED)             │
│ ├─ Update Order (status: CONFIRMED)                      │
│ ├─ Publish order.status_changed event (Kafka)           │
│ └─ Emit WebSocket notification to user                  │
└──────────────────────────────────────────┬───────────────┘
                                           │
4. INVENTORY RESERVATION
┌──────────────────────────────────────────▼───────────────┐
│ inventory-service consumes inventory.reserve_requested   │
│ ├─ Acquire Redis lock: lock:inventory:{skuId}           │
│ ├─ Check stock > quantity                                │
│ ├─ Update inventory_on_hand, inventory_reserved          │
│ ├─ Release lock                                          │
│ ├─ Publish inventory.reserved (success) or              │
│ │  inventory.reserve_failed (insufficient stock)         │
│ └─ Emit Kafka event                                      │
└──────────────────────────────────────────┬───────────────┘
                                           │
5. FULFILLMENT TASK CREATION
┌──────────────────────────────────────────▼───────────────┐
│ fulfillment-service consumes inventory.reserved          │
│ ├─ Create FulfillmentTask (status: PENDING)             │
│ ├─ Assign to warehouse (nearest by address distance)     │
│ ├─ Set SLA deadline (e.g., 24 hours)                    │
│ ├─ Create FulfillmentTaskItems (one per SKU)            │
│ └─ Notify warehouse staff (WebSocket)                    │
└──────────────────────────────────────────┬───────────────┘
                                           │
6. PICKING & PACKING
┌──────────────────────────────────────────▼───────────────┐
│ Warehouse staff updates task (WebSocket)                 │
│ ├─ Status: PENDING → PICKING → PACKING → PACKED         │
│ ├─ Update FulfillmentTaskItem.picked_quantity           │
│ ├─ Publish fulfillment.packed event                     │
│ └─ Emit notifications to order-service + user           │
└──────────────────────────────────────────┬───────────────┘
                                           │
7. SHIPMENT CREATION
┌──────────────────────────────────────────▼───────────────┐
│ delivery-service consumes fulfillment.packed             │
│ ├─ Create Shipment entity                               │
│ ├─ Call GHN/GHTK API to create shipment                 │
│ ├─ Get tracking number + carrier URL                    │
│ ├─ Update Shipment (status: ASSIGNED_DRIVER)            │
│ ├─ Publish shipment.status_changed event                │
│ └─ Emit WebSocket: user can track shipment              │
└──────────────────────────────────────────┬───────────────┘
                                           │
8. DELIVERY PHASE
┌──────────────────────────────────────────▼───────────────┐
│ Carrier (GHN/GHTK) updates tracking periodically         │
│ delivery-service polls external APIs                     │
│ ├─ Fetch latest status (IN_TRANSIT, OUT_FOR_DELIVERY)   │
│ ├─ Update Shipment.status + ShipmentTracking.location   │
│ ├─ Publish shipment.status_changed → order-service      │
│ ├─ Send email/SMS notifications to user                 │
│ └─ Emit WebSocket: real-time location map              │
└──────────────────────────────────────────┬───────────────┘
                                           │
9. DELIVERY CONFIRMATION
┌──────────────────────────────────────────▼───────────────┐
│ Carrier confirms delivery (status: DELIVERED)            │
│ delivery-service publishes order.delivered event         │
│ ├─ order-service: Update Order (status: DELIVERED)       │
│ ├─ product-service: Mark order eligible for review       │
│ ├─ Send thank you email                                  │
│ └─ Emit WebSocket: order complete                       │
└──────────────────────────────────────────────────────────┘
```

## Kafka Event Flow

```
Topic: order.created (Partition 1)
┌─────────────────────────────────────────────┐
│ Event: OrderCreatedEvent                    │
│ {orderId, userId, items[{skuId, qty}]}     │
└─────────────────────────────────────────────┘
    │
    ├─► Consumed by: inventory-service
    │   Action: Reserve stock for each item
    │   Produces: inventory.reserve_requested
    │
    └─► Consumed by: fulfillment-service (future, for pre-picking)

Topic: inventory.reserved
┌─────────────────────────────────────────────┐
│ Event: InventoryReservedEvent               │
│ {orderId, skuId, warehouseId, quantity}    │
└─────────────────────────────────────────────┘
    │
    ├─► Consumed by: order-service
    │   Action: Update Order status CONFIRMED
    │
    └─► Consumed by: fulfillment-service
        Action: Create FulfillmentTask

Topic: fulfillment.packed
┌─────────────────────────────────────────────┐
│ Event: FulfillmentPackedEvent               │
│ {taskId, orderId, shipmentId}               │
└─────────────────────────────────────────────┘
    │
    └─► Consumed by: delivery-service
        Action: Create Shipment, integrate with GHN/GHTK

Topic: shipment.status_changed
┌─────────────────────────────────────────────┐
│ Event: ShipmentStatusChangedEvent           │
│ {shipmentId, orderId, status, location}    │
└─────────────────────────────────────────────┘
    │
    ├─► Consumed by: order-service
    │   Action: Update Order tracking info
    │   Emit: WebSocket notification to user
    │
    └─► Consumed by: analytics (future)
        Action: Update delivery KPIs

Topic: order.delivered
┌─────────────────────────────────────────────┐
│ Event: OrderDeliveredEvent                  │
│ {orderId, userId, deliveryDate}             │
└─────────────────────────────────────────────┘
    │
    ├─► Consumed by: product-service
    │   Action: Mark order eligible for reviews
    │
    └─► Consumed by: analytics (future)
        Action: Track customer lifetime value
```

## Authentication & Authorization

```
1. LOGIN FLOW
┌────────────────────────────────────┐
│ POST /api/v1/auth/login            │
│ {email, password}                  │
└────────────────┬───────────────────┘
                 │
         user-service
                 │
        ├─ Query User by email
        ├─ Verify password (BCrypt)
        ├─ Generate JWT token (HMAC-SHA256, 15min expiry)
        ├─ Generate refresh token (7-day expiry, stored in DB + Redis)
        └─ Return {accessToken, refreshToken, user}
                 │
                 ▼
         Response to client
         ├─ accessToken → localStorage
         ├─ refreshToken → httpOnly cookie
         └─ User profile → Zustand store

2. AUTHORIZED REQUEST
┌────────────────────────────────────┐
│ GET /api/v1/orders                 │
│ Header: Authorization: Bearer <token> (from localStorage)
└────────────────┬───────────────────┘
                 │
         API Gateway
                 │
        ├─ Extract token from Authorization header
        ├─ Verify signature (HMAC-SHA256 with secret)
        ├─ Check expiry (issueAt + 15min)
        ├─ Extract userId, roles from payload
        └─ Set request context (userId, roles)
                 │
                 ▼
         order-service
                 │
        └─ Query orders filtered by userId (RBAC enforced)
                 │
                 ▼
         Response to client

3. TOKEN REFRESH
┌────────────────────────────────────┐
│ POST /api/v1/auth/refresh          │
│ Cookie: refreshToken=<token>       │
└────────────────┬───────────────────┘
                 │
         user-service
                 │
        ├─ Verify refresh token (check DB + Redis blacklist)
        ├─ Issue new access token (15min)
        ├─ Return {accessToken, ...}
        └─ Axios interceptor catches 401 → auto-refresh
                 │
                 ▼
         Retry original request with new token

4. LOGOUT
┌────────────────────────────────────┐
│ POST /api/v1/auth/logout           │
│ Header: Authorization: Bearer <token>
└────────────────┬───────────────────┘
                 │
         user-service
                 │
        ├─ Extract JTI (JWT ID) from token
        ├─ Add JTI to Redis blacklist (TTL: 7 days)
        ├─ Delete refresh token from DB
        └─ Return 200 OK
                 │
                 ▼
         Frontend
         ├─ Clear localStorage (accessToken)
         ├─ Clear cookies (refreshToken)
         ├─ Clear Zustand store
         └─ Redirect to /login
```

## API Request Flow

```
HTTP Request enters API Gateway:

┌─ (1) CorrelationIdMiddleware ────────────────────────┐
│ • Check X-Correlation-Id header                      │
│ • If missing, generate new UUID                      │
│ • Store in MDC (Mapped Diagnostic Context)           │
│ • Add to response headers                            │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (2) GlobalExceptionMiddleware ──────────────────────┐
│ • Wraps downstream to catch exceptions               │
│ • Maps exceptions to HTTP status codes                │
│ • Logs errors with CorrelationId                     │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (3) ApiKeyAuthMiddleware (if required) ─────────────┐
│ • Extract X-Api-Key header (for service-to-service)  │
│ • Validate HMAC-SHA256 signature                     │
│ • Set request context (ServiceId, ApiKeyDetails)     │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (4) JWT Auth Filter (for user endpoints) ───────────┐
│ • Extract Authorization: Bearer <token>              │
│ • Verify JWT signature                               │
│ • Check expiry                                       │
│ • Set SecurityContext (userId, roles)                │
│ • If invalid/expired: return 401 Unauthorized        │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (5) CORS Filter ────────────────────────────────────┐
│ • Check Origin header                                │
│ • Add Access-Control-Allow-* headers                 │
│ • Handle preflight OPTIONS requests                  │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (6) Rate Limiting Filter (optional) ─────────────────┐
│ • Track requests per user/IP                         │
│ • Enforce limits (e.g., 100 req/min per user)        │
│ • Return 429 Too Many Requests if exceeded           │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (7) Route to Backend Service ──────────────────────┐
│ • Spring Cloud Gateway routes based on path         │
│ • /api/v1/users/* → user-service:8081              │
│ • /api/v1/products/* → product-service:8082        │
│ • /api/v1/orders/* → order-service:8083            │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (8) Backend Service Processes Request ──────────────┐
│ • Controller receives request                        │
│ • CorrelationId available in MDC                    │
│ • Business logic executes (service + repository)    │
│ • Database operations use connections from pool     │
│ • Return response DTO                               │
└──────────────────────┬───────────────────────────────┘
                       │
┌─ (9) Response Returns to Gateway ────────────────────┐
│ • Set HTTP status code                              │
│ • Add CorrelationId to response headers             │
│ • Serialize response to JSON                        │
│ • Log response (status, duration)                   │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
             HTTP Response to Client
             ├─ Status Code (200, 201, 400, 401, 404, 500, etc.)
             ├─ Headers (Content-Type, X-Correlation-Id, etc.)
             └─ Body: JSON response or error
```

## Database Connection Flow

```
Backend Service → Connection Pool (20 connections default)
                      │
                      ├─ Available connections (idle)
                      ├─ Active connections (in-use)
                      └─ Queue (requests waiting for connection)

                      │
                      ▼
                PostgreSQL Server
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
      user-db   product-db  order-db  (All in ecommerce database)
         │            │            │
         ├─ Tables    ├─ Tables    ├─ Tables
         ├─ Indexes   ├─ Indexes   ├─ Indexes
         └─ Sequences └─ Sequences └─ Sequences

Flyway Migrations (auto-applied on startup):
├─ user-service: V1, V2, ..., V19
├─ product-service: V1, V2, ...
├─ order-service: V1, V2, ...
├─ inventory-service: V1, V2, ...
├─ fulfillment-service: V1, V2, ...
└─ delivery-service: V1, V2, ...
```

## Caching Strategy

```
Frontend (Browser)
  │
  ├─ HTTP Cache Headers (Cache-Control, ETag)
  │  └─ Static assets (images, CSS, JS) cached 1 year
  │
  └─ React Query Cache
     └─ Stale While Revalidate (SWR) pattern
        └─ API responses cached, background refetch

Backend (Redis)
  │
  ├─ Session Cache: session:{sessionId} (TTL: 30 days)
  │
  ├─ Cart Cache: cart:{userId} (TTL: 7 days)
  │  └─ Stored as JSON: {items: [{skuId, qty}], total}
  │
  ├─ Product Cache: product:{productId} (TTL: 1 hour)
  │  └─ Invalidated on product update
  │
  ├─ Distributed Locks: lock:inventory:{skuId} (TTL: 10 seconds)
  │  └─ Prevents overselling during concurrent reservations
  │
  └─ Blacklist Cache: blacklist:jti:{jti} (TTL: 7 days)
     └─ Revoked JWT tokens (on logout)

Elasticsearch (Product Search)
  │
  └─ ProductDocument index (daily rotation)
     └─ Queried for: q=keyword, category=x, price_range=y
```

## Resilience Patterns

```
Circuit Breaker Pattern (for external services):

              ┌─────────────────────┐
              │ 3+ consecutive       │
              │ failures detected    │
              │ (trip threshold)     │
              └──────────┬──────────┘
                         │
                         ▼
    ┌───────────────────────────────────────┐
    │        OPEN (Break circuit)           │
    │ • Fail fast (immediate timeout)       │
    │ • Return 503 Service Unavailable      │
    │ • Log circuit open event              │
    │ • TTL: 30 seconds                     │
    └───────────┬──────────────────────────┘
                │
        30 seconds elapse
                │
                ▼
    ┌───────────────────────────────────────┐
    │       HALF-OPEN (Test recovery)       │
    │ • Allow single request through        │
    │ • Observe response                    │
    └───────────┬──────────────────────────┘
                │
        ┌───────┴────────┐
        │ Success?       │ Failure?
        ▼                ▼
    ┌─────────┐   ┌──────────────┐
    │ CLOSED  │   │ OPEN again   │
    │ (resume)│   │ (restart 30s)│
    └─────────┘   └──────────────┘

Applied to:
├─ VNPay payment gateway calls
├─ GHN/GHTK carrier API calls
└─ External analytics service (future)

Retry Policy:
├─ Max retries: 3 attempts
├─ Backoff: exponential (1s, 2s, 4s)
├─ Jitter: random 0-100ms added (prevent thundering herd)
└─ Transient exceptions: network timeout, 5xx status codes
```

## Scalability Architecture

```
Production Deployment (Multi-instance, Load Balanced):

                    ┌──────────────┐
                    │ Load Balancer│
                    │ (AWS ALB or  │
                    │  Nginx)      │
                    └──────┬───────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ API Gateway-1 │  │ API Gateway-2 │  │ API Gateway-3 │
│   (port 8080) │  │   (port 8080) │  │   (port 8080) │
└──────┬────────┘  └──────┬────────┘  └──────┬────────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   service cluster   service cluster   service cluster
   (order, product)  (inventory, user) (fulfillment)
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    ┌─────────┐   ┌──────────────┐   ┌─────────┐
    │PostgreSQL│   │ Redis Cluster│   │ Kafka   │
    │Primary   │   │(replication) │   │(brokers)│
    │+ Replicas│   └──────────────┘   └─────────┘
    └─────────┘

Auto-Scaling Rules:
├─ CPU > 70% for 5 min → Add instance
├─ CPU < 30% for 10 min → Remove instance
├─ Max instances: 10 per service
└─ Min instances: 2 per service (for availability)
```

## Security Layers

```
Layer 1: Network (Kubernetes Network Policies)
├─ Ingress: Only from load balancer
├─ Egress: Only to databases, Kafka, external APIs
└─ Service-to-service: mTLS (mutual TLS, optional)

Layer 2: API Gateway
├─ CORS: Whitelist allowed origins
├─ Rate limiting: 100 requests/minute per user
├─ Request size limit: 10MB max
└─ HTTPS: TLS 1.2+ enforced

Layer 3: Authentication
├─ JWT token validation
├─ OAuth2 (Google) for social login
└─ Token expiry: 15 minutes (access), 7 days (refresh)

Layer 4: Authorization (Role-Based Access Control)
├─ @PreAuthorize("hasRole('ADMIN')") on admin endpoints
├─ @PreAuthorize("hasRole('CUSTOMER')") on user endpoints
└─ Row-level security: User can only see own orders

Layer 5: Data Layer
├─ Parameterized queries (prevent SQL injection)
├─ Input validation (Bean Validation / @Valid)
├─ Output encoding (JSON escaping)
└─ Secrets management: Environment variables, not in code

Layer 6: Encryption
├─ HTTPS in transit (TLS 1.2+)
├─ Password hashing: BCrypt (10+ rounds)
└─ Sensitive data: Hashed (JTI tokens), encrypted (credit cards if stored)
```

---

## Deployment Architectures

### Local Development (docker-compose)
```
All services + infrastructure in single docker-compose.yml
├─ Services: 7 backend services + 1 frontend
├─ Infrastructure: PostgreSQL, Redis, Kafka, Elasticsearch, MinIO
├─ Network: ecommerce-network (bridge)
└─ Startup: ~60 seconds total
```

### Kubernetes Production
```
Namespaces:
├─ ecommerce-prod (production)
├─ ecommerce-staging (staging)
└─ monitoring (Prometheus, Grafana)

Deployments per service:
├─ api-gateway (replicas: 3)
├─ user-service (replicas: 2)
├─ product-service (replicas: 3)
├─ order-service (replicas: 3)
├─ inventory-service (replicas: 2)
├─ fulfillment-service (replicas: 2)
└─ delivery-service (replicas: 2)

StatefulSets (data layer):
├─ PostgreSQL (replicas: 3, with persistent volumes)
├─ Redis (replicas: 3, cluster mode)
├─ Kafka (replicas: 3, brokers)
├─ Elasticsearch (replicas: 3, with persistent volumes)
└─ MinIO (replicas: 4, with persistent volumes)

Services (internal DNS):
├─ api-gateway:8080
├─ user-service:8081
├─ etc.

Ingress (external access):
├─ api.example.com → api-gateway:8080
├─ app.example.com → frontend (react, served by nginx)
└─ monitoring.example.com → Grafana:3000
```

---

## Performance Considerations

### Database Optimization
```
Indexes on common queries:
├─ User: UNIQUE(email), INDEX(role, enabled)
├─ Order: INDEX(user_id, created_at), INDEX(status)
├─ Product: UNIQUE(slug), INDEX(status), INDEX(created_at)
└─ Inventory: UNIQUE(sku_id, warehouse_id)

Query optimization:
├─ Use EXPLAIN PLAN to analyze slow queries
├─ Avoid SELECT * (fetch only needed columns)
├─ Use JPA projections for aggregations
└─ Batch operations (bulk insert/update) when possible
```

### Caching Strategy
```
Cache invalidation patterns:
├─ Time-based (TTL): Product cache (1 hour)
├─ Event-based: Invalidate on product update via Kafka
├─ Write-through: Update cache when DB is updated
└─ Cache-aside: Fetch from DB if not in cache
```

### API Response Optimization
```
Pagination:
├─ Default: 20 items per page
├─ Max: 100 items per page
└─ Cursor-based (offset not recommended for large tables)

Response compression:
├─ Enable gzip compression (Content-Encoding: gzip)
├─ Minify JSON responses
└─ Consider protobuf for internal service calls

Connection pooling:
├─ PostgreSQL: HikariCP (20 connections default)
├─ Redis: Jedis (configurable pool size)
└─ Kafka: Batch consumer (reduce per-message overhead)
```

---

## Monitoring & Observability

```
Metrics Collection (Prometheus):
├─ HTTP requests: latency, status codes, error rates
├─ Database: connection pool size, query latency
├─ JVM: heap memory, garbage collection, thread count
├─ Custom: business metrics (orders created, revenue)
└─ Scrape interval: 15 seconds

Dashboards (Grafana):
├─ Overview: services status, error rates, latency (P50/P95/P99)
├─ Service-specific: requests per second, error breakdown
├─ Infrastructure: CPU, memory, disk usage
└─ Business: orders per minute, revenue, popular products

Alerts (configured in Prometheus):
├─ ServiceDown: Any service DOWN for > 1 minute → page on-call
├─ HighErrorRate: 5xx errors > 5% → alert engineers
├─ SlowAPI: P95 latency > 500ms → investigate
├─ DatabaseDown: PostgreSQL unavailable → critical alert
└─ KafkaLag: Consumer lag > 10k messages → alert

Logging (Structured with Correlation IDs):
├─ All logs include: timestamp, level, logger, correlationId, message
├─ Aggregated in ELK Stack (Elasticsearch, Logstash, Kibana)
├─ Retention: 30 days hot, 1 year cold storage
└─ Searchable by: correlationId, userId, orderId, errorCode
```

---

## Summary

This architecture supports:
- **High Availability:** Multi-instance deployments, failover
- **Scalability:** Horizontal scaling of services, database replication
- **Maintainability:** Microservices isolation, clear separation of concerns
- **Observability:** Structured logging, metrics, tracing
- **Security:** Multi-layer authentication, encryption, input validation
- **Performance:** Caching, connection pooling, CDN for static assets
- **Resilience:** Circuit breakers, retry policies, graceful degradation
