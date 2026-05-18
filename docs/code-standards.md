# E-Commerce + Logistics Platform — Code Standards & Development Guidelines

## Naming Conventions

### Java/Backend

**Classes & Interfaces:**
```java
public class OrderService { }                    // ✓ PascalCase
public interface IOrderRepository { }             // ✓ I prefix for interfaces (optional)
public class OrderServiceImpl implements IOrderService { }  // ✓ Impl suffix for implementations
public record OrderDTO { }                       // ✓ DTO suffix for data objects
public enum OrderStatus { PENDING, CONFIRMED }  // ✓ PascalCase, UPPER_CASE values
```

**Methods & Properties:**
```java
public Order getOrderById(UUID orderId) { }      // ✓ camelCase, Verb-Noun pattern
public Order findByOrderNumber(String num) { }   // ✓ findBy* for queries
public void updateOrderStatus(OrderStatus s) { } // ✓ updateXxx for mutations
public boolean isOrderValid() { }                // ✓ isXxx for boolean queries
private final OrderRepository repository;        // ✓ _camelCase for private fields (optional)
private static final int MAX_ORDER_ITEMS = 100; // ✓ UPPER_SNAKE_CASE for constants
```

**Variables & Parameters:**
```java
var orderId = UUID.randomUUID();                 // ✓ camelCase
final String customerEmail = order.getEmail();   // ✓ Explicit types for clarity
int MAX_RETRIES = 3;                             // ✓ Constants UPPER_SNAKE_CASE
```

**Package Names:**
```
com.ecommerce.order.domain          // ✓ lowercase, dot-separated
com.ecommerce.order.service         // ✓ Logical grouping
com.ecommerce.order.controller      // ✓ Layer-based organization
```

### TypeScript/Frontend

**Components:**
```typescript
export function ProductCard() { }                // ✓ PascalCase, .tsx extension
export function useCart() { }                    // ✓ useXxx for custom hooks
export const productStore = create(...);         // ✓ camelCase for stores
```

**Functions & Variables:**
```typescript
const getOrderById = async (id: string) => { }  // ✓ camelCase, descriptive
const isOrderValid = (order: Order) => { };     // ✓ isXxx for boolean
const handleOrderSubmit = () => { };            // ✓ handleXxx for event handlers
const formatCurrency = (amount: number) => { }; // ✓ formatXxx for formatting
```

**Types & Interfaces:**
```typescript
interface Order {                               // ✓ PascalCase, no I prefix
  id: string;
  status: OrderStatus;
  items: OrderItem[];
}

type OrderStatus = "PENDING" | "CONFIRMED";    // ✓ Union types for enums
enum UserRole {                                 // ✓ PascalCase, UPPER_CASE values
  ADMIN = "ADMIN",
  CUSTOMER = "CUSTOMER",
}
```

**Files:**
```
ProductCard.tsx              // ✓ Components: PascalCase
useCart.ts                   // ✓ Hooks: camelCase
orderApi.ts                  // ✓ Utilities: camelCase
OrderStatus.ts               // ✓ Enums/Types: PascalCase
```

## File Organization

### Backend (Java)

**One responsibility per file:**
```
user-service/src/main/java/com/ecommerce/user/
├── domain/
│   ├── User.java           # Entity
│   ├── Address.java        # Entity
│   └── UserRole.java       # Enum
├── dto/
│   ├── UserRequest.java    # Request DTO
│   ├── UserResponse.java   # Response DTO
│   └── AddressDTO.java     # Nested DTO
├── repository/
│   ├── UserRepository.java # JPA interface
│   └── AddressRepository.java
├── service/
│   ├── UserService.java    # Business logic
│   ├── AuthService.java    # Auth logic
│   └── AddressService.java
├── controller/
│   ├── UserController.java
│   └── AuthController.java
├── security/
│   ├── JwtTokenProvider.java
│   └── CustomUserDetailsService.java
├── config/
│   └── SecurityConfig.java
├── exception/
│   ├── UserNotFoundException.java
│   └── InvalidPasswordException.java
└── UserServiceApplication.java
```

**Namespace hierarchy mirrors folder structure:**
```java
// File: user-service/src/main/java/com/ecommerce/user/service/UserService.java
package com.ecommerce.user.service;

public class UserService {
    private final UserRepository userRepository;
    // ...
}
```

### Frontend (React)

**Component structure:**
```
src/
├── pages/
│   └── home.tsx                    # Full page, mounted via router
├── components/
│   ├── product/
│   │   ├── ProductCard.tsx         # Reusable card component
│   │   ├── ProductForm.tsx         # Form component
│   │   └── ProductCard.module.css  # Scoped styles
│   └── layout/
│       └── Navbar.tsx
├── hooks/
│   └── useCart.ts                  # Custom hook (no .tsx)
├── store/
│   └── authStore.ts                # Zustand store
├── api/
│   └── productApi.ts               # API functions
├── types/
│   └── product.ts                  # TypeScript interfaces
└── utils/
    └── format.ts                   # Utility functions
```

**Naming rules:**
- **pages/*.tsx** — Full route pages (lowercase, hyphens for multi-word)
- **components/**ComponentName.tsx** — Reusable components (PascalCase)
- **hooks/useXxx.ts** — Custom hooks (camelCase with use prefix)
- **store/xxxStore.ts** — Zustand stores (camelCase)
- **api/xxxApi.ts** — API functions (camelCase)
- **types/xxx.ts** — Type definitions (camelCase)
- **utils/xxx.ts** — Utility functions (camelCase)

## Async/Await Patterns

### Backend (Java)

**Always async for I/O operations:**
```java
// ✓ Good: CompletableFuture for non-blocking
public CompletableFuture<Order> getOrderByIdAsync(UUID orderId) {
    return CompletableFuture.supplyAsync(() -> 
        orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException())
    );
}

// ✓ Good: Reactor for Spring reactive
public Mono<Order> getOrderById(UUID orderId) {
    return Mono.fromCallable(() -> 
        orderRepository.findById(orderId)
            .orElseThrow()
    );
}

// ✗ Bad: Blocking call on main thread
public Order getOrderById(UUID orderId) {
    return orderRepository.findById(orderId).orElseThrow();
}

// ✗ Bad: .block() on reactive (defeats purpose)
public Order getOrder(UUID id) {
    return orderService.getOrderByIdAsync(id).block();
}
```

**Virtual threads (Java 19+):**
```java
// ✓ Good: Lightweight threads for high concurrency
@GetMapping("/{orderId}")
public Order getOrder(@PathVariable UUID orderId) {
    return orderRepository.findById(orderId).orElseThrow();
    // Runs on virtual thread, low overhead
}
```

### Frontend (TypeScript)

**Async/await for API calls:**
```typescript
// ✓ Good: async/await
const loadOrder = async (orderId: string) => {
    try {
        const response = await axios.get(`/api/v1/orders/${orderId}`);
        setOrder(response.data);
    } catch (error) {
        setError(error.message);
    }
};

// ✓ Good: React Query (preferred for server state)
const { data: order, isLoading, error } = useQuery(
    ["order", orderId],
    () => api.getOrder(orderId)
);

// ✗ Bad: Promise .then chains (hard to read)
const loadOrder = (orderId: string) => {
    axios.get(`/api/v1/orders/${orderId}`)
        .then(res => setOrder(res.data))
        .catch(err => setError(err.message));
};

// ✗ Bad: Missing error handling
const order = await api.getOrder(orderId);
```

## Error Handling

### Backend (Java)

**Use custom exceptions for domain logic:**
```java
// ✓ Good: Custom exception with context
public class InsufficientStockException extends BusinessException {
    public InsufficientStockException(String skuId, int requested, int available) {
        super(String.format(
            "SKU %s: requested %d units, only %d available",
            skuId, requested, available
        ));
    }
}

// ✓ Good: Specific exceptions caught and handled
try {
    inventoryService.reserveStock(orderId, skuId, quantity);
} catch (InsufficientStockException ex) {
    // Handle stock shortage specifically
    order.setStatus(OrderStatus.CANCELLED);
    // Refund payment
} catch (WarehouseOfflineException ex) {
    // Handle warehouse unavailability
    order.setStatus(OrderStatus.PENDING);
    // Retry later
}

// ✗ Bad: Catching all exceptions
try {
    inventoryService.reserveStock(orderId, skuId, quantity);
} catch (Exception ex) {
    // Generic handling loses context
}

// ✗ Bad: Re-throwing without context
try {
    inventoryService.reserveStock(orderId, skuId, quantity);
} catch (Exception ex) {
    throw ex;  // Lost original context
}
```

**Global exception handler:**
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleOrderNotFound(OrderNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse("ORDER_NOT_FOUND", ex.getMessage()));
    }
    
    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ErrorResponse> handleInsufficientStock(InsufficientStockException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(new ErrorResponse("INSUFFICIENT_STOCK", ex.getMessage()));
    }
}
```

### Frontend (TypeScript)

**Use try/catch for async operations:**
```typescript
// ✓ Good: Explicit error handling with types
const handleOrderSubmit = async () => {
    try {
        const result = await api.createOrder(cartData);
        navigate(`/orders/${result.id}`);
    } catch (error) {
        if (error instanceof ValidationError) {
            setFieldErrors(error.fields);
        } else if (error instanceof PaymentError) {
            setError("Payment failed. Please try again.");
        } else {
            setError("Unexpected error. Please contact support.");
        }
    } finally {
        setLoading(false);
    }
};

// ✓ Good: Type guard for error responses
const handleError = (error: unknown) => {
    if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        if (status === 400) {
            return `Validation error: ${data.message}`;
        } else if (status === 401) {
            // Re-direct to login
            return "Session expired";
        }
    }
    return "Unknown error";
};

// ✗ Bad: No error handling
const orders = await api.getOrders();  // Crash if request fails

// ✗ Bad: Generic error catch
try {
    await api.createOrder(data);
} catch (e: any) {  // Avoid any
    console.log(e.message);  // Unsafe access
}
```

## Logging Standards

### Backend (Java)

**Use SLF4J with structured logging:**
```java
// ✓ Good: Structured logging with context
private static final Logger logger = LoggerFactory.getLogger(OrderService.class);

public Order createOrder(OrderRequest request) {
    final UUID orderId = UUID.randomUUID();
    
    logger.info(
        "Creating order: orderId={}, userId={}, itemCount={}",
        orderId, request.getUserId(), request.getItems().size()
    );
    
    try {
        // Create order logic
        logger.debug("Order created, reserving inventory: orderId={}", orderId);
        inventoryService.reserve(orderId, items);
        
        logger.info(
            "Order confirmed: orderId={}, totalAmount={}, paymentMethod={}",
            orderId, order.getTotalAmount(), order.getPaymentMethod()
        );
        return order;
    } catch (InsufficientStockException ex) {
        logger.warn(
            "Order creation failed due to insufficient stock: orderId={}, message={}",
            orderId, ex.getMessage()
        );
        throw ex;
    } catch (Exception ex) {
        logger.error(
            "Unexpected error creating order: orderId={}",
            orderId, ex
        );
        throw new RuntimeException("Order creation failed", ex);
    }
}

// ✗ Bad: String concatenation
logger.info("Creating order for user " + userId);

// ✗ Bad: No context
logger.error("Error occurred", exception);

// ✗ Bad: println (not structured)
System.out.println("Order created");
```

**Log levels:**
- **ERROR** — Service unavailable, data loss risk, immediate action needed
- **WARN** — Degraded performance, expected errors (validation), retry happening
- **INFO** — Significant events (order created, payment confirmed), monitoring
- **DEBUG** — Method entry/exit, variable values, cache hits
- **TRACE** — Verbose (byte counts, loop iterations), rarely enabled

### Frontend (TypeScript)

**Use console with appropriate levels:**
```typescript
// ✓ Good: Structured logging
const logger = {
    info: (message: string, data?: any) => {
        console.log(`[INFO] ${message}`, data);
    },
    error: (message: string, error?: Error) => {
        console.error(`[ERROR] ${message}`, error);
    },
    debug: (message: string, data?: any) => {
        if (process.env.DEBUG) console.log(`[DEBUG] ${message}`, data);
    }
};

const handleOrderSubmit = async () => {
    logger.info("Submitting order", { itemCount: cart.items.length });
    try {
        const result = await api.createOrder(cartData);
        logger.info("Order created successfully", { orderId: result.id });
    } catch (error) {
        logger.error("Order creation failed", error as Error);
    }
};

// ✗ Bad: No context
console.log(order);

// ✗ Bad: Using alert for logging
alert("Order created");
```

## Testing Standards

### Backend (Java)

**JUnit 5 with AAA pattern (Arrange, Act, Assert):**
```java
@SpringBootTest
class OrderServiceTest {
    
    @Autowired
    private OrderService orderService;
    
    @Mock
    private OrderRepository orderRepository;
    
    @Test
    @DisplayName("CreateOrder should reserve inventory and confirm payment")
    void testCreateOrderSuccess() {
        // Arrange
        UUID orderId = UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest()
            .setUserId("user-123")
            .setItems(List.of(new OrderItem("sku-1", 2)))
            .setShippingAddressId("addr-456");
        
        when(orderRepository.save(any())).thenReturn(new Order(orderId));
        
        // Act
        Order result = orderService.createOrder(request);
        
        // Assert
        assertThat(result.getId()).isEqualTo(orderId);
        assertThat(result.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        verify(orderRepository).save(any(Order.class));
    }
    
    @Test
    @DisplayName("CreateOrder should throw InsufficientStockException when stock unavailable")
    void testCreateOrderInsufficientStock() {
        // Arrange
        CreateOrderRequest request = new CreateOrderRequest()
            .setItems(List.of(new OrderItem("sku-out-of-stock", 10)));
        
        when(inventoryService.reserve(any(), any()))
            .thenThrow(new InsufficientStockException("sku-out-of-stock", 10, 0));
        
        // Act & Assert
        assertThatThrownBy(() -> orderService.createOrder(request))
            .isInstanceOf(InsufficientStockException.class)
            .hasMessageContaining("sku-out-of-stock");
    }
}
```

**Test naming convention:**
```java
// ✓ Good: MethodName_Scenario_Expected
testCreateOrder_WithValidItems_ReturnsConfirmedOrder()
testGetOrder_WithInvalidId_ThrowsOrderNotFoundException()
testUpdateOrderStatus_FromPendingToConfirmed_Success()

// ✗ Bad: Unclear names
testOrder()
test1()
testCreateOrder() // Scenario unclear
```

**Integration tests with Testcontainers:**
```java
@Testcontainers
@SpringBootTest
class OrderServiceIntegrationTest {
    
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
        DockerImageName.parse("postgres:16"));
    
    @DynamicPropertySource
    static void setProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    
    @Test
    void testOrderCreationIntegration() {
        // Use real database, no mocks
        Order order = orderService.createOrder(request);
        
        Order retrieved = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(retrieved).isEqualToComparingFieldByField(order);
    }
}
```

### Frontend (TypeScript)

**React Testing Library (prefer user interactions):**
```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("OrderCheckout", () => {
    test("should submit order when all fields valid", async () => {
        // Arrange
        const mockOnSuccess = vi.fn();
        render(<OrderCheckout onSuccess={mockOnSuccess} />);
        
        const emailInput = screen.getByLabelText(/email/i);
        const submitButton = screen.getByRole("button", { name: /submit/i });
        
        // Act
        await userEvent.type(emailInput, "user@example.com");
        await userEvent.click(submitButton);
        
        // Assert
        await waitFor(() => {
            expect(mockOnSuccess).toHaveBeenCalled();
        });
    });
    
    test("should show validation error for invalid email", async () => {
        render(<OrderCheckout />);
        
        const emailInput = screen.getByLabelText(/email/i);
        const submitButton = screen.getByRole("button", { name: /submit/i });
        
        await userEvent.type(emailInput, "invalid-email");
        await userEvent.click(submitButton);
        
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
});
```

**Test file naming:**
```typescript
// ✓ Good: .test.ts or .spec.ts near component
OrderCheckout.test.tsx
useCart.test.ts
orderApi.test.ts

// ✗ Bad: Tests in separate folder far from code
tests/OrderCheckout.test.tsx  // Hard to maintain
```

## Code Organization Principles

### Layered Architecture

**Backend (Java):**
```
Domain Layer
├─ Entities (User, Order, Product)
├─ Enums (OrderStatus, UserRole)
└─ Exceptions (custom exceptions)

Service Layer
├─ Business logic
├─ Orchestration
└─ Transaction management

Repository Layer
├─ Data access
├─ Query construction
└─ Caching

Controller Layer
├─ Request mapping
├─ Response formatting
└─ HTTP handling
```

**Frontend (React):**
```
Pages (Route handlers)
├─ Full screen components
└─ Coordinate multiple sections

Components (Reusable widgets)
├─ Presentational
├─ Container components
└─ Composable units

Hooks (Custom logic)
├─ State management
├─ API interactions
└─ Side effects

Store (Global state)
├─ Zustand stores
└─ Persisted state
```

### SOLID Principles

**Single Responsibility:**
```java
// ✗ Bad: OrderService does too much
class OrderService {
    public Order createOrder(...) { /* checkout logic */ }
    public void sendEmail(...) { /* email sending */ }
    public void calculateTax(...) { /* tax calculation */ }
    public void integratePayment(...) { /* payment */ }
}

// ✓ Good: Separated concerns
class OrderService {
    public Order createOrder(...) { /* orchestrates */ }
}
class EmailService {
    public void sendOrderConfirmation(...) { }
}
class TaxService {
    public BigDecimal calculateTax(...) { }
}
class PaymentService {
    public Payment process(...) { }
}
```

**Open/Closed (extend, don't modify):**
```java
// ✗ Bad: Add new carrier → modify if/else
public String generateTrackingUrl(String carrier, String trackingNum) {
    if ("GHN".equals(carrier)) return "https://ghn.vn/tracking/" + trackingNum;
    if ("GHTK".equals(carrier)) return "https://ghtk.vn/tracking/" + trackingNum;
    throw new UnsupportedOperationException();
}

// ✓ Good: Add new carrier → implement interface
public interface CarrierClient {
    String getTrackingUrl(String trackingNum);
}

public class GhnCarrierClient implements CarrierClient {
    @Override
    public String getTrackingUrl(String trackingNum) {
        return "https://ghn.vn/tracking/" + trackingNum;
    }
}

public class GhtkCarrierClient implements CarrierClient {
    @Override
    public String getTrackingUrl(String trackingNum) {
        return "https://ghtk.vn/tracking/" + trackingNum;
    }
}
```

## Code Quality Checklist

Before committing code:

**Backend (Java):**
- [ ] Naming follows PascalCase (classes) / camelCase (methods, variables)
- [ ] Methods < 30 lines (< 15 preferred)
- [ ] No try/catch for control flow
- [ ] Custom exceptions used for domain errors
- [ ] Logging with structured context
- [ ] No TODO/FIXME comments without issue number
- [ ] Unit tests written (AAA pattern)
- [ ] Integration tests for critical paths
- [ ] No SQL injection (parameterized queries)
- [ ] No hardcoded secrets (use environment variables)
- [ ] Code compiles without warnings
- [ ] Tests pass locally

**Frontend (TypeScript):**
- [ ] Naming follows PascalCase (components) / camelCase (functions)
- [ ] No any types (use proper TypeScript)
- [ ] Components < 200 LOC (< 100 preferred)
- [ ] Hooks properly documented
- [ ] Error handling for all async operations
- [ ] No console.log in production code
- [ ] Accessible markup (alt text, ARIA labels)
- [ ] Mobile responsive (tested on mobile sizes)
- [ ] Unit tests written
- [ ] ESLint passes
- [ ] TypeScript strict mode enabled
- [ ] No unused imports or variables

## Documentation Standards

**Java:**
```java
/**
 * Creates a new order from cart items.
 *
 * @param request the order creation request containing items, address, payment method
 * @return the created Order with status CONFIRMED
 * @throws InsufficientStockException if any item exceeds available inventory
 * @throws PaymentProcessingException if payment processing fails
 * @throws OrderValidationException if request validation fails
 */
public Order createOrder(CreateOrderRequest request) {
    // ...
}
```

**TypeScript:**
```typescript
/**
 * Fetches orders for the authenticated user.
 * 
 * @param page - Page number (0-indexed), default 0
 * @param limit - Number of items per page, default 20
 * @returns Promise resolving to paginated order list
 * @throws Error if authentication token missing or invalid
 * 
 * @example
 * const orders = await getOrders(0, 20);
 */
export const getOrders = (page = 0, limit = 20): Promise<PageResponse<Order>> => {
    return axios.get("/api/v1/orders", { params: { page, limit } });
};
```

---

## Summary

Follow these principles:
1. **Consistency** — Same patterns across all services
2. **Clarity** — Names that explain intent without comments
3. **Testability** — Small, focused functions easy to unit test
4. **Maintainability** — Clear structure, minimal dependencies
5. **Accessibility** — Frontend must be usable by all
6. **Security** — No secrets in code, parameterized queries
7. **Performance** — Async I/O, efficient queries, proper caching
8. **Documentation** — Code comments only for "why", not "what"
