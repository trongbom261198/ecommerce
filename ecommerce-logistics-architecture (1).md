# E-Commerce + Logistics — Architecture Document

> Stack: Java 21 · Spring Boot 3 · React 18 · PostgreSQL 16 · Kafka
> Python ML Service — Phase 2 (tích hợp sau)

---

## 1. Tổng quan bài toán

Xây dựng hệ thống E-commerce tích hợp Logistics end-to-end:

- Quản lý sản phẩm, đơn hàng, người dùng
- Quản lý kho, fulfillment, giao hàng
- Tối ưu hóa tuyến đường (VRP), dự báo nhu cầu, định giá động
- Event-driven architecture để đồng bộ giữa các service

**Hàm mục tiêu:**
```
Min Z = C_inventory + C_transport + C_stockout
s.t.
  Supply[i]     >= Demand[j]       -- cân bằng cung cầu
  Inventory[t]  >= Safety_stock    -- dự trữ an toàn
  Delivery_time <= SLA             -- cam kết dịch vụ
  Budget        <= B_max           -- ngân sách
```

---

## 2. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT LAYER                      │
│        React 18 (Web) · React Native · Partner API  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / REST / WebSocket
┌──────────────────────▼──────────────────────────────┐
│          API GATEWAY  (Spring Cloud Gateway)         │
│          JWT Auth · Rate Limit · Load Balance        │
└──────┬──────────────┬─────────────────┬─────────────┘
       │              │                 │
┌──────▼──────┐ ┌─────▼──────────┐ ┌───▼─────────────┐
│  ORDER SVC  │ │  PRODUCT SVC   │ │    USER SVC      │
│  Cart       │ │  Catalog · SKU │ │    JWT · RBAC    │
│  Checkout   │ │  Search (ES)   │ │    Profile       │
│  Lifecycle  │ │  Pricing       │ │    Address       │
└──────┬──────┘ └─────┬──────────┘ └───┬─────────────┘
       │              │                 │
       └──────────────┼─────────────────┘
                      │ Domain Events
┌─────────────────────▼───────────────────────────────┐
│               EVENT BUS  (Apache Kafka)              │
│    order.created · stock.reserved · shipped · ...    │
└──────┬──────────────┬─────────────────┬─────────────┘
       │              │                 │
┌──────▼──────┐ ┌─────▼──────────┐ ┌───▼─────────────┐
│ INVENTORY   │ │ FULFILLMENT    │ │  DELIVERY SVC    │
│ Stock       │ │ Pick · Pack    │ │  VRP Solver      │
│ Reserve     │ │ WMS · SLA      │ │  Carrier API     │
│ Multi-WH    │ │ Task assign    │ │  Last-mile       │
└─────────────┘ └────────────────┘ └─────────────────┘
                      │
         ┌────────────▼──────────────────┐
         │  PRICING ENGINE  (Drools)     │
         │  Dynamic pricing · Discount   │
         └───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                  DATA LAYER                         │
│  PostgreSQL 16 · Redis 7 · Elasticsearch 8 · S3     │
└─────────────────────────────────────────────────────┘

── ── ── PHASE 2 — Python ML Service (sau) ── ── ──

┌─────────────────────────────────────────────────────┐
│              ML SERVICE  (Python / FastAPI)          │
│  Demand Forecast (Prophet) · Route Opt (OR-Tools)   │
│  Giao tiếp với Java services qua REST / Kafka       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Data Flow chính

```
Khách đặt hàng (React)
  → POST /api/v1/orders  (Order Service)
  → Kafka: order.created
  → Inventory Service reserve stock  (PESSIMISTIC_WRITE lock)
  → Kafka: inventory.reserved
  → Fulfillment Service tạo pick task
  → Kafka: fulfillment.packed
  → Delivery Service tạo shipment + optimize route
  → Kafka: shipment.status_changed
  → Order Service cập nhật trạng thái
  → WebSocket → React UI real-time update
```

---

## 4. Order State Machine

```
PENDING
  │ payment confirmed
CONFIRMED
  │ warehouse assigned
PROCESSING
  │ pick started
PICKING
  │ packing done
PACKED
  │ carrier picked up
SHIPPED
  │ delivery confirmed
DELIVERED  ──── refund approved ──→  REFUNDED

Từ PENDING / CONFIRMED / PROCESSING → CANCELLED (bất kỳ lúc nào)
```

---

## 5. Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Language | Java 21 (LTS) |
| Framework | Spring Boot 3.3 |
| API Gateway | Spring Cloud Gateway |
| Auth | Spring Security + JWT + Refresh Token |
| ORM | Spring Data JPA + Hibernate |
| DB Migration | Flyway |
| State Machine | Spring State Machine |
| Rule Engine | Drools (KIE) — pricing rules |
| Message Queue | Apache Kafka + Spring Kafka |
| Cache | Redis 7 + Spring Data Redis (Lettuce) |
| Search | Elasticsearch 8 + Spring Data Elasticsearch |
| Object Storage | AWS S3 / MinIO |
| Build | Maven (multi-module) |
| API Docs | SpringDoc OpenAPI / Swagger UI |
| Testing | JUnit 5 + Mockito + Testcontainers |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript 5 |
| Routing | React Router v6 |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| UI | shadcn/ui + Tailwind CSS |
| Forms | React Hook Form + Zod |
| HTTP | Axios + JWT interceptor |
| Real-time | SockJS + STOMP (order tracking) |
| Maps | Leaflet.js + React-Leaflet |
| Charts | Recharts (admin dashboard) |
| Testing | Vitest + React Testing Library |

### Infrastructure
| Component | Technology |
|---|---|
| Container (dev) | Docker + Docker Compose |
| Container (prod) | Kubernetes |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus + Grafana |
| Tracing | OpenTelemetry + Jaeger |
| Logging | ELK Stack |
| CDN | CloudFront / Cloudflare |
| Service Discovery | Spring Cloud Eureka |
| Config | Spring Cloud Config |

### ML Service — Phase 2 (Python)
| Module | Library | Giao tiếp |
|---|---|---|
| Demand Forecast | Prophet / XGBoost | REST → Java gọi HTTP |
| Route Optimization | Google OR-Tools | REST → Delivery Svc gọi |
| Pricing ML | scikit-learn | Kafka consumer |
| Data Pipeline | Apache Airflow | Scheduled, độc lập |
| Framework | FastAPI | Expose /predict endpoints |

---

## 6. Database Strategy

| Database | Vai trò |
|---|---|
| PostgreSQL 16 | Source of truth — tất cả transactional data |
| Redis 7 | Cart, session, stock cache, distributed lock, rate limit |
| Elasticsearch 8 | Read model cho product search (sync qua CDC / app event) |
| S3 / MinIO | Images, documents |
| ClickHouse *(Phase 2)* | Analytics warehouse |

**Tại sao PostgreSQL thay vì SQL Server / Oracle:**
- License $0 vs Oracle ~$47K/core/năm, SQL Server ~$15K/core/năm
- Spring Data JPA + Hibernate tích hợp tốt nhất với PG dialect
- Cloud-native: RDS, Supabase, Neon — không vendor lock-in
- JSONB column xử lý product attributes linh hoạt, không cần MongoDB

---

## 7. Database Schema — Danh sách bảng

| Bảng | Mô tả | Service |
|---|---|---|
| `users` | Tài khoản: customer, staff, admin, driver | User |
| `addresses` | Địa chỉ giao hàng của user | User |
| `categories` | Danh mục sản phẩm (cây cha-con) | Product |
| `products` | Sản phẩm, attributes JSONB, images JSONB | Product |
| `skus` | Biến thể sản phẩm (size, color...) | Product |
| `warehouses` | Kho hàng, tọa độ GPS | Inventory |
| `inventory` | Tồn kho theo SKU × Warehouse | Inventory |
| `orders` | Đơn hàng, snapshot địa chỉ JSONB | Order |
| `order_items` | Chi tiết sản phẩm trong đơn (snapshot giá) | Order |
| `order_events` | Audit log mọi thay đổi trạng thái | Order |
| `shipments` | Lô hàng, tracking, route_data JSONB | Delivery |
| `pricing_rules` | Rules discount/bundle/flash-sale JSONB | Pricing |
| `reviews` | Đánh giá sản phẩm (rating 1-5, comment) | Product |
| `purchased_products` | Lookup eligibility review — populated by Kafka consumer | Product |
| `user_identities` | Multi-provider auth link (GOOGLE, PASSWORD) | User |
| `refresh_tokens` | Refresh token store (password + OAuth flows) | User |

**Ghi chú thiết kế:**
- Dùng `UUID` làm primary key toàn bộ
- `shipping_address` trong `orders` là JSONB snapshot — không reference địa chỉ thật để tránh thay đổi sau khi đặt hàng
- `inventory` có `version` column cho optimistic lock fallback, dùng `PESSIMISTIC_WRITE` khi reserve
- Flyway đánh số migration per-service (mỗi service có sequence riêng):
  - product-service: `V1__init.sql`, `V2__create_reviews.sql`
  - user-service: `V1__create_users.sql` … `V19__add_oauth_providers.sql`
  - order-service, inventory-service, delivery-service: sequence riêng
- `products` có thêm `avg_rating NUMERIC(3,2)` và `review_count INTEGER` (denormalised, update mỗi lần có review mới)
- `user_identities` cho phép một user có nhiều provider (UNIQUE trên provider+provider_subject)

---

## 8. Kafka Topics

| Topic | Producer | Consumer | Payload chính |
|---|---|---|---|
| `order.created` | Order Svc | Inventory Svc | orderId, items[], totalAmount |
| `order.status_changed` | Order Svc | Notification Svc | orderId, fromStatus, toStatus |
| `inventory.reserve_requested` | Order Svc | Inventory Svc | orderId, items[] |
| `inventory.reserved` | Inventory Svc | Fulfillment Svc | orderId, reservations[] |
| `inventory.reserve_failed` | Inventory Svc | Order Svc | orderId, reason |
| `fulfillment.task_created` | Fulfillment Svc | Driver App | shipmentId, items[], slaDeadline |
| `fulfillment.packed` | Fulfillment Svc | Delivery Svc | shipmentId, orderId |
| `shipment.status_changed` | Delivery Svc | Order Svc | shipmentId, status, location |
| `order.delivered` | Delivery Svc | Order Svc, Analytics | orderId, deliveredAt |
| `order.review_eligible` | Order Svc | Product Svc | orderId, userId, productIds[], deliveredAt |
| `flash.sale.activated` | Order Svc (scheduler) | Product Svc, FE (WebSocket) | flashSaleId, items[], startAt, endAt |
| `flash.sale.ended` | Order Svc (scheduler) | Product Svc | flashSaleId |
| `flash.sale.purchased` | Order Svc | Inventory Svc | flashSaleId, skuId, quantity |

> **`order.review_eligible`**: Order Service publish sau khi đơn chuyển sang `DELIVERED`. Product Service consume để insert vào `purchased_products` — cho phép user đánh giá sản phẩm đó.

---

## 9. API Endpoints

### Auth Service
```
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
POST  /api/v1/auth/forgot-password        ← OTP email flow
POST  /api/v1/auth/reset-password

# Google OAuth2 (Spring-managed, routed qua Gateway → user-service)
GET   /oauth2/authorization/google        ← redirect to Google consent
GET   /login/oauth2/code/google           ← callback, issues JWT, redirect FE
```

### Product Service
```
GET    /api/v1/products?q=&category=&page=&size=&sort=
GET    /api/v1/products/{id}
POST   /api/v1/products                   [ADMIN]
PUT    /api/v1/products/{id}              [ADMIN]
DELETE /api/v1/products/{id}              [ADMIN]
GET    /api/v1/products/{id}/skus
GET    /api/v1/categories
GET    /api/v1/categories/{id}/products
GET    /api/v1/products/suggest?q=&limit= ← Search Autocomplete (public, ES matchPhrasePrefix)

# Reviews & Ratings
GET    /api/v1/products/{id}/reviews?page=&size=&sort=newest|highest|lowest
POST   /api/v1/products/{id}/reviews      [AUTH — must have purchased+delivered]
PUT    /api/v1/products/{id}/reviews      [AUTH — own review only]
GET    /api/v1/products/{id}/reviews/summary   ← avgRating, distribution, canReview
DELETE /api/v1/reviews/{reviewId}         [AUTH — author or ADMIN]
```

### Order Service
```
GET   /api/v1/orders
GET   /api/v1/orders/{id}
POST  /api/v1/orders                      [checkout]
PUT   /api/v1/orders/{id}/cancel
GET   /api/v1/orders/{id}/tracking
```

### Cart (Redis-backed)
```
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/{skuId}
DELETE /api/v1/cart/items/{skuId}
DELETE /api/v1/cart
```

### Inventory Service
```
GET  /api/v1/inventory?skuId=&warehouseId=
POST /api/v1/inventory/adjust             [ADMIN]
POST /api/v1/inventory/reserve            [internal]
POST /api/v1/inventory/release            [internal]
```

### Delivery Service
```
GET  /api/v1/shipments/{id}
GET  /api/v1/shipments/{id}/tracking
POST /api/v1/shipments/{id}/optimize-route
PUT  /api/v1/shipments/{id}/status        [DRIVER/STAFF]
```

---

## 10. Redis Keys Convention

```
cart:{userId}                  TTL 7d   → JSON giỏ hàng
blacklist:{jti}                TTL =exp → JWT bị revoke
stock:{skuId}:{warehouseId}    TTL 30s  → Integer tồn kho cache
ratelimit:{ip}:{endpoint}      TTL 60s  → Integer đếm request
lock:inventory:{skuId}         TTL 10s  → Distributed lock khi reserve
otp:{email}                    TTL 5m   → OTP string (forgot-password flow)
channel:order:{orderId}        pub/sub  → WebSocket tracking broadcast
flash_sale:{id}:stock:{skuId}  TTL =endAt → Integer remaining flash-sale stock
oauth2:state:{state}           TTL 10m  → CSRF state param (Spring-managed)
```

---

## 11. Java Backend — Multi-module Maven

```
ecommerce-backend/
├── pom.xml                      ← parent POM
├── common/                      ← shared DTOs, exceptions, Kafka event classes
├── api-gateway/                 ← Spring Cloud Gateway + JWT filter
├── user-service/
├── product-service/
├── order-service/
├── inventory-service/
├── fulfillment-service/
├── delivery-service/
└── docker-compose.yml
```

Mỗi service có cấu trúc nội bộ:
```
{service}/src/main/java/com.ecommerce.{service}/
├── controller/
├── service/
├── repository/
├── entity/
├── dto/
├── event/          ← Kafka producers/consumers
├── oauth/          ← (user-service only) OAuth2 handlers + entities
└── config/
```

**user-service oauth/ package:**
```
oauth/
├── AuthProvider.java          ← enum: GOOGLE, PASSWORD
├── UserIdentity.java          ← @Entity — multi-provider link
├── UserIdentityRepository.java
├── OAuth2UserLinkService.java ← findOrCreate: sub → email → create
├── OAuth2LoginSuccessHandler.java  ← issues JWT, redirects FE via fragment
└── OAuth2LoginFailureHandler.java  ← redirects /login?error=oauth_failed
```

---

## 12. React Frontend — Cấu trúc thư mục

```
frontend/src/
├── pages/
│   ├── HomePage.tsx             ← animated hero + blobs + flash sale + stats
│   ├── ProductListPage, ProductDetailPage
│   ├── CartPage, CheckoutPage
│   ├── LoginPage, RegisterPage  ← includes GoogleLoginButton
│   ├── ForgotPasswordPage       ← email OTP flow
│   ├── OAuthCallbackPage.tsx    ← reads URL fragment → loginWithTokens()
│   ├── OrderDetail, OrderTracking, OrdersPage
│   └── admin/  Orders, Inventory, Analytics, Products, Categories, Users, FlashSales
├── components/
│   ├── ui/         ← shadcn/ui + LoadingSpinner
│   ├── layout/
│   │   ├── Navbar.tsx           ← glassmorphism on scroll, animated dropdown
│   │   ├── Footer.tsx           ← newsletter strip, social icons, payment badges
│   │   └── SearchBox.tsx        ← rich autocomplete dropdown + keyboard nav
│   ├── product/
│   │   └── ProductCard.tsx      ← hover lift, wishlist heart, gradient price, star badge
│   ├── review/
│   │   ├── StarRating.tsx       ← read-only + interactive, sm/md/lg sizes
│   │   ├── ReviewSummary.tsx    ← avg + distribution bars
│   │   ├── ReviewList.tsx       ← paginated, avatar initials
│   │   └── ReviewForm.tsx       ← guarded by canReview flag
│   ├── home/
│   │   └── flash-sale-banner.tsx ← FlipDigit countdown, shimmer, hover-lift items
│   └── auth/
│       └── GoogleLoginButton.tsx ← anchor → /oauth2/authorization/google
├── hooks/
│   ├── use-cart.ts
│   ├── use-orders.ts
│   ├── use-order-tracking.ts      ← STOMP WebSocket
│   ├── use-in-view.ts             ← IntersectionObserver scroll-reveal
│   └── use-search-suggestions.ts  ← debounced TanStack Query suggest hook
├── services/                      ← Axios API calls
│   ├── api.ts                     ← instance + JWT interceptor + refresh
│   ├── authService.ts
│   ├── productService.ts
│   ├── orderService.ts
│   ├── cartService.ts
│   ├── review-service.ts          ← review CRUD + summary
│   └── suggest-service.ts         ← autocomplete endpoint
├── store/                         ← Zustand + persist
│   ├── authStore.ts               ← setAuth, loginWithTokens (OAuth), logout
│   └── cartStore.ts
└── types/                         ← TypeScript interfaces
    ├── order.ts, product.ts, user.ts
    └── review.ts
```

**Animations & UI system:**
- Custom Tailwind keyframes: `fadeInUp`, `float`, `gradientShift`, `flipIn`, `scaleIn`, `bounceIn`, `blob`, `shimmerSlide`
- `useInView` hook + `.section-hidden/.section-visible` CSS classes → scroll-triggered entrance animations
- Glassmorphism: `backdrop-blur-md bg-white/90` on Navbar khi scroll

---

## 13. Infrastructure — Docker Compose (dev)

Services cần chạy local:
- `postgres:16-alpine` — port 5432
- `redis:7-alpine` — port 6379
- `confluentinc/cp-zookeeper:7.6.0` — port 2181
- `confluentinc/cp-kafka:7.6.0` — port 9092
- `elasticsearch:8.13.0` — port 9200
- `kibana:8.13.0` — port 5601

---

## 14. Thứ tự phát triển

### Phase 1 — Core E-commerce (Java + React) ✅ Complete
1. Docker Compose + Flyway migrations (toàn bộ schema)
2. `common` module — DTOs, exceptions, Kafka event classes
3. `user-service` — register, login, JWT, refresh token
4. `product-service` — CRUD, Elasticsearch sync
5. React: trang danh sách sản phẩm, chi tiết, tìm kiếm
6. `order-service` — cart (Redis), checkout, state machine
7. `inventory-service` — reserve với pessimistic lock
8. Kafka wiring: Order → Inventory → Fulfillment
9. React: cart, checkout, order detail, order tracking (WebSocket)

### Phase 1.5 — Tier 1 Gap Features (đang hoàn thiện)
- ✅ **UI/UX Overhaul** — animated hero, glassmorphism navbar, scroll-reveal, flash sale countdown
- ✅ **Search Autocomplete** — ES matchPhrasePrefix, debounced dropdown, keyboard nav
- ✅ **Reviews & Ratings** — Kafka eligibility check, denormalised avg, ES sync, full CRUD + pagination
- ✅ **Google OAuth2** — Spring oauth2-client, user_identities table, JWT via URL fragment, FE OAuthCallbackPage
- ✅ **Flash Sale** — Redis stock countdown, FlipDigit timer, Kafka lifecycle events
- ✅ **Email OTP / Forgot Password** — email infra, OTP Redis TTL 5m
- ✅ **VNPay Payment** — payment gateway integration, result page
- ✅ **Live Chat** — WebSocket chat widget, pre-chat form, admin chat page
- 🔲 Voucher / Coupon — pending
- 🔲 Persistent Wishlist — pending

### Phase 2 — Logistics + ML (Java + Python)
10. `fulfillment-service` — pick/pack workflow, SLA timer
11. `delivery-service` — shipment, carrier GHN/GHTK integration
12. Python FastAPI ML service — Demand Forecast + Route Optimization
13. Java services gọi ML service qua REST
14. Admin dashboard (React + Recharts)

---

## 15. Environment Variables (tóm tắt)

```
# Spring Boot
SPRING_DATASOURCE_URL          jdbc:postgresql://...
SPRING_DATA_REDIS_HOST
SPRING_KAFKA_BOOTSTRAP_SERVERS
SPRING_ELASTICSEARCH_URIS
APP_JWT_SECRET
APP_JWT_EXPIRE_MS

# React
VITE_API_BASE_URL
VITE_WS_URL

# Carriers
GHN_API_KEY, GHN_SHOP_ID
GHTK_API_KEY

# Storage
AWS_S3_BUCKET, AWS_S3_REGION

# Google OAuth2
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
OAUTH2_REDIRECT_URI          # http://localhost:8080/login/oauth2/code/google
FE_OAUTH_REDIRECT            # http://localhost:5173/oauth/callback

# Payment
VNPAY_TMN_CODE
VNPAY_HASH_SECRET

# Email (SMTP)
SPRING_MAIL_HOST
SPRING_MAIL_PORT
SPRING_MAIL_USERNAME
SPRING_MAIL_PASSWORD

# ML Service (Phase 2)
ML_SERVICE_URL
```

---

## 16. Auth Flows

### Password Login
```
FE POST /api/v1/auth/login → user-service → verify bcrypt → issue JWT (access+refresh) → return tokens
```

### Google OAuth2
```
FE → GET /oauth2/authorization/google (via Gateway → user-service)
  → Spring redirects to accounts.google.com
  → User consents
  → Google callback: GET /login/oauth2/code/google?code=...
  → user-service: exchange code → verify ID token → findOrCreate user_identities
  → issue JWT → redirect FE: /oauth/callback#access=...&refresh=...
  → OAuthCallbackPage: parse fragment → loginWithTokens() → navigate("/")
```

### Forgot Password (Email OTP)
```
FE POST /api/v1/auth/forgot-password {email}
  → user-service generates OTP → store Redis otp:{email} TTL 5m → send email
  → FE submits OTP + new password to POST /api/v1/auth/reset-password
  → user-service verifies OTP → update password_hash → invalidate all refresh tokens
```

---

*Stack: Java 21 · Spring Boot 3.3 · React 18 · TypeScript · PostgreSQL 16 · Kafka · Redis · Elasticsearch 8*
*Python ML — Phase 2*
*Last updated: 2026-05-11*
