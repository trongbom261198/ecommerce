# E-Commerce + Logistics Platform — Codebase Summary

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React 18)                    │
│                    http://localhost:5173                    │
└────────────────────────┬────────────────────────────────────┘
                         │ Axios HTTP client
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               API Gateway (Spring Cloud Gateway)            │
│                    http://localhost:8080                    │
│  JWT validation | CORS headers | Rate limiting | Routing   │
└────────────────────────┬────────────────────────────────────┘
                         │
       ┌─────────┬───────┼────────┬──────────┬───────┐
       ▼         ▼       ▼        ▼          ▼       ▼
    user-    product- order- inventory- fulfill- delivery-
   service   service  service  service    service   service
   (8081)    (8082)   (8083)   (8084)     (8085)    (8086)

   Shared Infrastructure:
   ├─ PostgreSQL 16 (ecommerce DB)
   ├─ Redis 7 (cache, sessions, locks)
   ├─ Kafka 7.6 (event streaming, 9+ topics)
   ├─ Elasticsearch 8.13 (search + autocomplete)
   ├─ MinIO (image storage)
   └─ Prometheus/Grafana (monitoring)
```

## Service Inventory

| Service | Port | Responsibility | Database Tables | Kafka Topics |
|---------|------|-----------------|-----------------|---------------|
| **user-service** | 8081 | Auth, profiles, addresses | User, Address, RefreshToken, UserIdentity | none |
| **product-service** | 8082 | Catalog, SKUs, reviews, search | Product, Category, Sku, Review, ProductDocument (ES) | order.review_eligible (consume) |
| **order-service** | 8083 | Cart, orders, checkout, payments, flash sales, chat | Order, OrderItem, Payment, FlashSale, FlashSaleItem, ChatRoom, ChatMessage, OrderAuditEvent | order.created, order.status_changed, inventory.reserved/failed, shipment.status_changed (produce/consume) |
| **inventory-service** | 8084 | Stock, warehouses, reservations | Inventory, Warehouse, InventoryAuditLog | inventory.reserve_requested (consume), inventory.reserved/reserve_failed (produce) |
| **fulfillment-service** | 8085 | Picking, packing, task tracking | FulfillmentTask, FulfillmentTaskItem | inventory.reserved (consume), fulfillment.packed (produce) |
| **delivery-service** | 8086 | Shipments, tracking, carriers | Shipment, ShipmentTracking | fulfillment.packed (consume), shipment.status_changed, order.delivered (produce) |
| **common** | — | Shared library | — | KafkaTopics interface, Events, DTOs, Exceptions |

## Codebase Metrics

```
Backend:
├─ user-service:        ~1,200 LOC (auth, profiles, addresses)
├─ product-service:     ~1,500 LOC (CRUD, search, reviews)
├─ order-service:       ~2,800 LOC (orders, payments, state machine, chat)
├─ inventory-service:   ~1,200 LOC (stock, reservations, locking)
├─ fulfillment-service: ~900 LOC (packing, task tracking)
├─ delivery-service:    ~1,000 LOC (shipments, tracking, carriers)
└─ common:              ~600 LOC (shared DTOs, events, exceptions)
Total Backend:          ~9,200 LOC

Frontend:
├─ pages/               ~2,000 LOC (routes, screens)
├─ components/          ~3,000 LOC (reusable widgets)
├─ hooks/               ~600 LOC (custom React hooks)
├─ store/               ~400 LOC (Zustand stores)
└─ api/                 ~500 LOC (Axios client, endpoints)
Total Frontend:         ~6,500 LOC

Tests:
├─ Backend tests:       ~2,500 LOC (JUnit 5 + Testcontainers)
├─ Frontend tests:      ~1,500 LOC (Vitest, React Testing Library)
Total Tests:            ~4,000 LOC

Documentation:
├─ API docs:            Swagger (auto-generated)
├─ Architecture:        system-architecture.md (~750 LOC)
├─ Code standards:      code-standards.md (~600 LOC)
└─ README:              ~300 LOC

Total project:          ~20,000 LOC (code + tests + docs)
```

## Directory Structure

```
project/
├── backend/
│   ├── api-gateway/
│   │   ├── src/main/java/com/ecommerce/gateway/
│   │   │   ├── config/          # GatewayConfig (routes, CORS, auth)
│   │   │   ├── filter/          # JwtAuthenticationFilter, RequestIdFilter
│   │   │   └── GatewayApplication.java
│   │   └── pom.xml
│   │
│   ├── user-service/
│   │   ├── src/main/java/com/ecommerce/user/
│   │   │   ├── domain/          # User, Address, RefreshToken entities
│   │   │   ├── dto/             # UserRequest, UserResponse, AddressDTO
│   │   │   ├── repository/      # UserRepository, AddressRepository (JPA)
│   │   │   ├── service/         # UserService, AuthService, OtpService
│   │   │   ├── controller/      # AuthController, UserController, AdminController
│   │   │   ├── security/        # JwtTokenProvider, CustomUserDetailsService
│   │   │   └── UserServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/    # V1_init_users.sql, V2_add_addresses.sql, etc.
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── product-service/
│   │   ├── src/main/java/com/ecommerce/product/
│   │   │   ├── domain/          # Product, Category, Sku, Review entities
│   │   │   ├── dto/             # ProductDTO, CategoryDTO, ReviewDTO
│   │   │   ├── repository/      # ProductRepository, CategoryRepository, ReviewRepository
│   │   │   ├── service/         # ProductService, CategoryService, ReviewService, SearchService
│   │   │   ├── controller/      # ProductController, CategoryController, ReviewController, SearchController
│   │   │   ├── search/          # ElasticsearchConfiguration, ProductDocument
│   │   │   ├── event/           # OrderReviewEligibleEventListener
│   │   │   └── ProductServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── order-service/
│   │   ├── src/main/java/com/ecommerce/order/
│   │   │   ├── domain/          # Order, OrderItem, Payment, FlashSale, ChatRoom entities
│   │   │   ├── dto/             # OrderRequest, OrderResponse, PaymentDTO, ChatDTO
│   │   │   ├── repository/      # OrderRepository, PaymentRepository, ChatRepository
│   │   │   ├── service/         # OrderService, CartService, PaymentService, ChatService, FlashSaleService
│   │   │   ├── controller/      # OrderController, CartController, PaymentController, ChatController, FlashSaleController
│   │   │   ├── statemachine/    # OrderStateMachine, OrderStateConfig
│   │   │   ├── event/           # Kafka producers/consumers
│   │   │   ├── messaging/       # WebSocket handlers (STOMP)
│   │   │   └── OrderServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── inventory-service/
│   │   ├── src/main/java/com/ecommerce/inventory/
│   │   │   ├── domain/          # Inventory, Warehouse entities
│   │   │   ├── dto/             # InventoryDTO, WarehouseDTO, ReservationDTO
│   │   │   ├── repository/      # InventoryRepository, WarehouseRepository
│   │   │   ├── service/         # InventoryService, WarehouseService, ReservationService
│   │   │   ├── controller/      # InventoryController, WarehouseController
│   │   │   ├── event/           # ReservationEventListener
│   │   │   ├── lock/            # RedisDistributedLock
│   │   │   └── InventoryServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── fulfillment-service/
│   │   ├── src/main/java/com/ecommerce/fulfillment/
│   │   │   ├── domain/          # FulfillmentTask, FulfillmentTaskItem entities
│   │   │   ├── dto/             # FulfillmentTaskDTO
│   │   │   ├── repository/      # FulfillmentTaskRepository
│   │   │   ├── service/         # FulfillmentService, TaskAssignmentService
│   │   │   ├── controller/      # FulfillmentController
│   │   │   ├── event/           # FulfillmentEventListener
│   │   │   └── FulfillmentServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── delivery-service/
│   │   ├── src/main/java/com/ecommerce/delivery/
│   │   │   ├── domain/          # Shipment, ShipmentTracking entities
│   │   │   ├── dto/             # ShipmentDTO, TrackingDTO
│   │   │   ├── repository/      # ShipmentRepository
│   │   │   ├── service/         # ShipmentService, TrackingService, CarrierService (GHN, GHTK)
│   │   │   ├── controller/      # ShipmentController, TrackingController
│   │   │   ├── event/           # ShipmentEventListener, ShipmentEventProducer
│   │   │   ├── carrier/         # GhnCarrierClient, GhtkCarrierClient
│   │   │   └── DeliveryServiceApplication.java
│   │   ├── src/main/resources/
│   │   │   ├── db/migration/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   └── common/
│       ├── src/main/java/com/ecommerce/common/
│       │   ├── dto/              # ApiResponse<T>, PageResponse<T>
│       │   ├── event/            # Kafka events (OrderCreatedEvent, etc.)
│       │   ├── exception/        # BusinessException, NotFoundException
│       │   ├── constants/        # KafkaTopics (centralized topic names)
│       │   └── util/             # DateUtil, JsonUtil, etc.
│       └── pom.xml
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── home.tsx                    # Homepage + product listing
│   │   │   ├── product-detail.tsx          # Product detail + reviews
│   │   │   ├── login.tsx                   # Login form
│   │   │   ├── register.tsx                # Registration form
│   │   │   ├── forgot-password.tsx         # OTP recovery
│   │   │   ├── cart.tsx                    # Shopping cart
│   │   │   ├── checkout.tsx                # Order creation + payment
│   │   │   ├── orders.tsx                  # Order history
│   │   │   ├── order-tracking.tsx          # Real-time tracking
│   │   │   ├── payment-result.tsx          # VNPay redirect handler
│   │   │   ├── admin/
│   │   │   │   ├── orders.tsx
│   │   │   │   ├── inventory.tsx
│   │   │   │   ├── products.tsx
│   │   │   │   ├── categories.tsx
│   │   │   │   ├── users.tsx
│   │   │   │   ├── flash-sales.tsx
│   │   │   │   ├── chat.tsx
│   │   │   │   └── analytics.tsx
│   │   │   └── oauth-callback.tsx          # Google OAuth callback
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   └── AdminLayout.tsx
│   │   │   ├── product/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── ProductForm.tsx
│   │   │   │   ├── SkuForm.tsx
│   │   │   │   └── ReviewList.tsx
│   │   │   ├── order/
│   │   │   │   ├── OrderList.tsx
│   │   │   │   ├── OrderDetails.tsx
│   │   │   │   ├── TrackingMap.tsx
│   │   │   │   └── StatusTimeline.tsx
│   │   │   ├── checkout/
│   │   │   │   ├── CartSummary.tsx
│   │   │   │   ├── AddressSelector.tsx
│   │   │   │   ├── ShippingCalculator.tsx
│   │   │   │   └── PaymentMethod.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatWidget.tsx
│   │   │   │   ├── ChatMessages.tsx
│   │   │   │   └── ChatInput.tsx
│   │   │   ├── common/
│   │   │   │   ├── StarRating.tsx
│   │   │   │   ├── SearchBox.tsx
│   │   │   │   ├── ImageUploader.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── Pagination.tsx
│   │   │   └── admin/
│   │   │       ├── DataTable.tsx
│   │   │       ├── FilterPanel.tsx
│   │   │       └── AnalyticsDashboard.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useCart.ts                  # Shopping cart operations
│   │   │   ├── useOrders.ts                # Order fetching + pagination
│   │   │   ├── useOrderTracking.ts         # Real-time tracking via WebSocket
│   │   │   ├── useChatSocket.ts            # WebSocket chat connection
│   │   │   ├── useProvinces.ts             # Shipping provinces/districts
│   │   │   ├── useSearchSuggestions.ts     # Autocomplete search
│   │   │   ├── useAuth.ts                  # Auth state + token refresh
│   │   │   ├── useInView.ts                # Intersection observer
│   │   │   └── useDebounce.ts              # Debouncing utility
│   │   │
│   │   ├── store/
│   │   │   ├── authStore.ts                # Zustand: user, token, role
│   │   │   ├── cartStore.ts                # Zustand: cart items, total
│   │   │   └── uiStore.ts                  # Zustand: loading, notifications
│   │   │
│   │   ├── api/
│   │   │   ├── axios.ts                    # Axios instance, interceptors
│   │   │   ├── auth.ts                     # /auth/*, /users/* endpoints
│   │   │   ├── products.ts                 # /products/*, /categories/*, /reviews/*
│   │   │   ├── orders.ts                   # /orders/*, /cart/*, /flash-sales/*
│   │   │   ├── inventory.ts                # /inventory/*, /warehouses/*
│   │   │   ├── payments.ts                 # /payments/vnpay/*
│   │   │   ├── delivery.ts                 # /shipments/*, /tracking/*
│   │   │   └── chat.ts                     # /chat/*, WebSocket connections
│   │   │
│   │   ├── types/
│   │   │   ├── user.ts                     # User, Address, UserRole interfaces
│   │   │   ├── product.ts                  # Product, Category, Sku, Review interfaces
│   │   │   ├── order.ts                    # Order, OrderItem, OrderStatus interfaces
│   │   │   ├── payment.ts                  # Payment, VNPayResponse interfaces
│   │   │   ├── chat.ts                     # ChatRoom, ChatMessage interfaces
│   │   │   └── common.ts                   # ApiResponse, PageResponse, enums
│   │   │
│   │   ├── utils/
│   │   │   ├── format.ts                   # Date, currency, string formatting
│   │   │   ├── validation.ts               # Email, phone, password validators
│   │   │   ├── localStorage.ts             # Persistent storage helpers
│   │   │   └── constants.ts                # API URLs, error messages
│   │   │
│   │   ├── App.tsx                         # Root component + routing
│   │   ├── index.tsx                       # React mount point
│   │   └── index.css                       # Global styles
│   │
│   ├── vite.config.ts                      # Vite build config
│   ├── tsconfig.json                       # TypeScript config
│   ├── tailwind.config.js                  # Tailwind CSS config
│   ├── package.json                        # Dependencies
│   └── package-lock.json
│
├── docs/
│   ├── README.md                           # Setup & quick start
│   ├── project-overview-pdr.md             # Business goals, requirements
│   ├── codebase-summary.md                 # THIS FILE
│   ├── code-standards.md                   # Naming, patterns, testing
│   ├── system-architecture.md              # Data flow, interactions, deployment
│   ├── project-roadmap.md                  # Phases, milestones, progress
│   └── deployment-guide.md                 # Local setup, env vars, production
│
├── docker-compose.yml                      # Multi-service stack definition
├── docker-compose.override.yml             # Development overrides
├── .env.example                            # Environment template
├── .gitignore
├── pom.xml (parent)                        # Maven multi-module project
└── README.md                               # Project root readme
```

## Key Technology Dependencies

### Backend (Java/Spring Boot)

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Framework | Spring Boot | 3.x | Web server, DI, config |
| Gateway | Spring Cloud Gateway | 4.x | API routing, auth filters |
| Data | Spring Data JPA | 3.x | ORM, database abstraction |
| Security | Spring Security | 6.x | JWT, OAuth2, RBAC |
| Messaging | Spring Kafka | 3.x | Event streaming |
| State Machine | Spring State Machine | 3.x | Order workflow |
| Web | Spring Web | 3.x | REST controllers, WebSocket |
| Validation | Hibernate Validator | 8.x | Bean validation |
| Database Driver | PostgreSQL JDBC | 42.7.x | Database connectivity |
| Caching | Spring Data Redis | 3.x | Cache operations |
| Search | Elasticsearch Client | 8.x | Full-text search |
| Storage | MinIO SDK | 8.x | S3-compatible objects |
| Testing | JUnit 5 | 5.x | Unit tests |
| Testing | Testcontainers | 1.19.x | Integration tests |
| Logging | SLF4J + Logback | 2.x | Structured logging |
| JSON | Jackson | 2.x | Serialization |
| Documentation | SpringDoc OpenAPI | 2.5.0 | Swagger generation |

### Frontend (React/TypeScript)

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Framework | React | 18.3.1 | UI library |
| Language | TypeScript | 5.5.3 | Type safety |
| Build Tool | Vite | 6.4.2 | Fast bundler |
| HTTP Client | Axios | 1.7.7 | API requests |
| State | Zustand | 4.5.5 | Global state |
| Server State | TanStack React Query | 5.56.2 | Data fetching/caching |
| Routing | React Router DOM | 6.26.2 | Page navigation |
| UI Components | Ant Design | 6.3.7 | Component library |
| CSS | Tailwind CSS | 3.4.11 | Utility-first styling |
| Maps | Leaflet | 1.9.x | Interactive maps |
| Charts | Recharts | 2.12.x | Data visualization |
| WebSocket | STOMP + SockJS | Latest | Real-time messaging |
| Testing | Vitest | Latest | Unit tests |
| Testing | React Testing Library | Latest | Component tests |
| Linting | ESLint | Latest | Code quality |
| Formatting | Prettier | Latest | Code formatting |

## Database Schema Summary

### Shared PostgreSQL (ecommerce DB)

**User Schema:**
- User (id, email, phone, password_hash, full_name, role, enabled, email_verified, created_at)
- Address (id, user_id, recipient, phone, street, ward, district, province, country, lat, lng, is_default)
- RefreshToken (id, user_id, token_hash, expires_at)
- UserIdentity (id, user_id, provider, provider_user_id)

**Product Schema:**
- Product (id, name, slug, description, brand, base_price, status, avg_rating, review_count, created_at)
- ProductImage (id, product_id, image_url, is_thumbnail, sort_order)
- ProductAttribute (id, product_id, name, value)
- Category (id, parent_id, name, slug, sort_order, active)
- Sku (id, product_id, sku_code, variant_name, attributes_json, price, cost_price, weight_grams)
- Review (id, product_id, user_id, rating, comment, created_at)

**Order Schema:**
- Order (id, order_number, user_id, status, subtotal, shipping_fee, discount_amount, total_amount, shipping_address_json, payment_method, payment_status, warehouse_id, created_at, updated_at)
- OrderItem (id, order_id, sku_id, product_id, quantity, unit_price, product_snapshot_json)
- OrderAuditEvent (id, order_id, event_type, from_status, to_status, actor_id, actor_type, metadata_json, created_at)
- Payment (id, order_id, vnp_txn_ref, amount, status, vnp_params_json, raw_response_json)
- FlashSale (id, name, status, discount_type, discount_value, max_quantity, start_time, end_time)
- FlashSaleItem (id, flash_sale_id, sku_id, product_id, original_price, sale_price, quota, sold)
- ChatRoom (id, user_id, status, contact_name, contact_phone)
- ChatMessage (id, room_id, sender_type, sender_id, content, created_at)
- ChatConfig (welcome_message, bot_enabled, bot_responses_json)

**Inventory Schema:**
- Inventory (id, sku_id, warehouse_id, quantity_on_hand, quantity_reserved, safety_stock, version)
- Warehouse (id, name, code, address, province, lat, lng, active)
- InventoryAuditLog (id, sku_id, warehouse_id, transaction_type, quantity_delta, reference_id)

**Fulfillment Schema:**
- FulfillmentTask (id, order_id, shipment_id, status, warehouse_id, sla_deadline, assigned_to, created_at)
- FulfillmentTaskItem (id, task_id, sku_id, sku_code, quantity, picked_quantity)

**Delivery Schema:**
- Shipment (id, order_id, tracking_number, carrier, carrier_tracking_url, status, from_warehouse_id, estimated_delivery, route_data_json, sla_deadline)
- ShipmentTracking (id, shipment_id, status, location, timestamp, carrier_response_json)

**Indexes:**
- User: UNIQUE(email), UNIQUE(phone), INDEX(role, enabled)
- Product: UNIQUE(slug), INDEX(status, created_at), FULLTEXT(name, description) for Elasticsearch
- Order: INDEX(user_id, created_at), INDEX(status), UNIQUE(order_number)
- OrderItem: INDEX(order_id), INDEX(sku_id)
- Inventory: UNIQUE(sku_id, warehouse_id), INDEX(quantity_on_hand)
- ChatMessage: INDEX(room_id, created_at)

## Key Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Microservices** | Backend architecture | Independent services per domain |
| **API Gateway** | Port 8080 | Single entry point, auth, routing |
| **Event-Driven** | Kafka topics | Loose coupling between services |
| **CQRS** | Product search | Elasticsearch for reads, PostgreSQL for writes |
| **State Machine** | order-service | Order workflow with validation |
| **Repository** | All services | Abstract data access |
| **Service Layer** | All services | Business logic orchestration |
| **DTO** | All controllers | Request/response contracts |
| **Dependency Injection** | Spring | Loose coupling, testability |
| **Middleware** | Gateway | Cross-cutting concerns (auth, logging) |
| **Distributed Locking** | inventory-service | Redis-based stock reservation |
| **WebSocket** | order-service | Real-time chat + order tracking |
| **Transaction** | All services | ACID compliance per operation |
| **Caching** | Redis | Session, cart, product data (30-day TTL) |

## Migration Strategy

**Flyway** manages schema versioning per service:
- user-service: V1 (users + tokens), V2 (addresses), V19 (oauth providers)
- product-service: V1 (products, categories), V2 (reviews)
- order-service: V1-Vn (orders, payments, chat, flash sales)
- inventory-service: V1 (inventory, warehouses)
- fulfillment-service: V1 (tasks, items)
- delivery-service: V1 (shipments, tracking)

**Backwards compatibility:** All migrations are additive; no breaking schema changes without deprecation period.

---

## Code Quality Metrics (Target)

| Metric | Target | Tool |
|--------|--------|------|
| Code Coverage | ≥70% | Jacoco (backend), Istanbul (frontend) |
| Test Count | 50+ unit, 30+ integration | JUnit 5, Testcontainers |
| Cyclomatic Complexity | <10 per method | SonarQube |
| Documentation | API docs + code comments | Swagger, JavaDoc |
| Linting | 0 critical errors | SonarQube, ESLint |
| Type Safety | 100% TypeScript | TypeScript strict mode |

---

## File Ownership & Responsibilities

| Component | Owner(s) | Tech |
|-----------|----------|------|
| API Gateway | Backend Lead | Spring Cloud Gateway |
| user-service | Auth Dev | Spring Security, JWT, OAuth2 |
| product-service | Product Dev | JPA, Elasticsearch, MinIO |
| order-service | Order Dev | Spring State Machine, Kafka, WebSocket |
| inventory-service | Inventory Dev | Redis distributed locks |
| fulfillment-service | Logistics Dev | Kafka event handling |
| delivery-service | Logistics Dev | Carrier API integrations |
| Frontend | Frontend Team | React, TypeScript, Vite |
| Tests | QA + Developers | JUnit 5, Testcontainers, Vitest |
| Infrastructure | DevOps | Docker, docker-compose, Kubernetes |

---

## Version Control

**Repository:** Git (GitHub or GitLab)
**Branch strategy:** Git Flow (main, develop, feature/*, release/*)
**Commit messages:** Conventional Commits (feat:, fix:, docs:, refactor:, test:, chore:)
**Code review:** Pull Requests with peer approval before merge

---

## Next Steps for Developers

1. Read [Code Standards](./code-standards.md) for naming conventions and patterns
2. Review [System Architecture](./system-architecture.md) for data flows and component interactions
3. Follow [Deployment Guide](./deployment-guide.md) to set up local development environment
4. Consult [Project Roadmap](./project-roadmap.md) for current phase and tasks
5. Use [Project Overview & PDR](./project-overview-pdr.md) for requirements and acceptance criteria
