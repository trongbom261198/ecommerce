package com.ecommerce.orderservice.service;

import com.ecommerce.common.event.InventoryReserveRequestedEvent;
import com.ecommerce.common.event.OrderCreatedEvent;
import com.ecommerce.common.event.OrderReviewEligibleEvent;
import com.ecommerce.common.event.OrderStatusChangedEvent;
import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.orderservice.cart.Cart;
import com.ecommerce.orderservice.cart.CartItem;
import com.ecommerce.orderservice.cart.CartService;
import com.ecommerce.orderservice.dto.*;
import com.ecommerce.orderservice.email.EmailService;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.OrderAuditEvent;
import com.ecommerce.orderservice.entity.OrderItem;
import com.ecommerce.orderservice.entity.PaymentStatus;
import com.ecommerce.orderservice.kafka.OrderEventProducer;
import com.ecommerce.orderservice.mapper.OrderMapper;
import com.ecommerce.orderservice.repository.OrderAuditEventRepository;
import com.ecommerce.orderservice.repository.OrderRepository;
import com.ecommerce.orderservice.statemachine.OrderEvent;
import com.ecommerce.orderservice.statemachine.OrderState;
import com.ecommerce.orderservice.websocket.OrderTrackingController;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private static final Set<OrderState> CANCELLABLE_STATES =
            EnumSet.of(OrderState.PENDING, OrderState.CONFIRMED, OrderState.PROCESSING);

    private static final BigDecimal FREE_SHIPPING_THRESHOLD = new BigDecimal("500000");
    private static final BigDecimal FLAT_SHIPPING_FEE = new BigDecimal("30000");

    private final OrderRepository orderRepository;
    private final OrderAuditEventRepository auditEventRepository;
    private final CartService cartService;
    private final OrderStateMachineService stateMachineService;
    private final OrderEventProducer eventProducer;
    private final OrderMapper orderMapper;
    private final OrderTrackingController trackingController;
    private final FlashSaleService flashSaleService;
    private final EmailService emailService;

    // -------------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<OrderSummaryResponse> getOrders(UUID userId, Pageable pageable) {
        return orderRepository.findByUserId(userId, pageable)
                .map(orderMapper::toOrderSummaryResponse);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderById(UUID orderId, UUID userId) {
        Order order = findOrderOrThrow(orderId);
        validateOwnership(order, userId);
        return orderMapper.toOrderResponse(order);
    }

    @Transactional(readOnly = true)
    public OrderTrackingResponse getOrderTracking(UUID orderId, UUID userId) {
        Order order = findOrderOrThrow(orderId);
        validateOwnership(order, userId);

        List<OrderAuditEvent> events = auditEventRepository.findByOrderIdOrderByCreatedAtDesc(orderId);
        List<OrderEventResponse> eventResponses = events.stream()
                .map(orderMapper::toOrderEventResponse)
                .collect(Collectors.toList());

        return OrderTrackingResponse.builder()
                .orderId(order.getId())
                .orderNumber(order.getOrderNumber())
                .status(order.getStatus())
                .events(eventResponses)
                .build();
    }

    // -------------------------------------------------------------------------
    // Commands
    // -------------------------------------------------------------------------

    public OrderResponse checkout(UUID userId, CheckoutRequest request, String userEmail) {
        // 1. Get & validate cart
        Cart cart = cartService.getCartForCheckout(userId.toString());

        // 2. Resolve shipping address
        Map<String, Object> shippingAddress = resolveShippingAddress(request);

        // 3. Build order
        String orderNumber = generateOrderNumber();
        BigDecimal subtotal = cart.getSubtotal();
        BigDecimal shippingFee = subtotal.compareTo(FREE_SHIPPING_THRESHOLD) >= 0
                ? BigDecimal.ZERO : FLAT_SHIPPING_FEE;

        // Apply flash sale discount if requested
        BigDecimal discountAmount = BigDecimal.ZERO;
        if (request.getFlashSaleId() != null && request.getFlashSaleSkuId() != null) {
            String flashSkuStr = request.getFlashSaleSkuId().toString();
            discountAmount = cart.getItems().stream()
                    .filter(i -> flashSkuStr.equals(i.getSkuId()))
                    .findFirst()
                    .map(flashItem -> flashSaleService.reserveAndGetDiscount(
                            request.getFlashSaleId(),
                            request.getFlashSaleSkuId(),
                            flashItem.getQuantity(),
                            flashItem.getUnitPrice(),
                            userId))
                    .orElse(BigDecimal.ZERO);
        }

        BigDecimal totalAmount = subtotal.add(shippingFee).subtract(discountAmount).max(BigDecimal.ZERO);

        Order order = Order.builder()
                .userId(userId)
                .orderNumber(orderNumber)
                .status(OrderState.PENDING)
                .subtotal(subtotal)
                .shippingFee(shippingFee)
                .discountAmount(discountAmount)
                .totalAmount(totalAmount)
                .shippingAddress(shippingAddress)
                .paymentMethod(request.getPaymentMethod())
                .paymentStatus(PaymentStatus.PENDING)
                .notes(request.getNotes())
                .userEmail(userEmail != null && !userEmail.isBlank() ? userEmail : null)
                .warehouseId(request.getWarehouseId())
                .build();

        // 4. Build order items from cart
        List<OrderItem> items = cart.getItems().stream()
                .map(cartItem -> buildOrderItem(order, cartItem))
                .collect(Collectors.toList());
        order.getItems().addAll(items);

        // 5. Persist
        Order savedOrder = orderRepository.save(order);
        if (userEmail != null && !userEmail.isBlank()) {
            emailService.sendOrderConfirmation(userEmail, orderNumber, totalAmount.toPlainString());
        }

        // 6. Audit event: CREATED → PENDING
        addAuditEvent(savedOrder, "ORDER_CREATED", null, OrderState.PENDING.name(),
                "Order placed successfully", userId, "CUSTOMER", null);

        // 7. Clear cart
        cartService.clearCart(userId.toString());

        // 8. Publish OrderCreatedEvent
        OrderCreatedEvent orderCreatedEvent = buildOrderCreatedEvent(savedOrder);
        eventProducer.publishOrderCreated(orderCreatedEvent);

        // 9. Publish InventoryReserveRequestedEvent
        InventoryReserveRequestedEvent reserveEvent = buildInventoryReserveEvent(savedOrder);
        eventProducer.publishInventoryReserveRequested(reserveEvent);

        log.info("Order {} created for user {}", orderNumber, userId);
        return orderMapper.toOrderResponse(savedOrder);
    }

    public void cancelOrder(UUID orderId, UUID userId) {
        Order order = findOrderOrThrow(orderId);
        validateOwnership(order, userId);

        if (!CANCELLABLE_STATES.contains(order.getStatus())) {
            throw new BusinessException(
                    422, "ORDER_NOT_CANCELLABLE",
                    "Order cannot be cancelled in status: " + order.getStatus());
        }

        processStateTransition(orderId, OrderEvent.CANCEL, userId, "CUSTOMER");
    }

    /**
     * Advances the order's state machine, saves the new state to DB, persists an audit entry,
     * publishes an OrderStatusChangedEvent, and notifies via WebSocket.
     */
    public void processStateTransition(UUID orderId, OrderEvent event,
                                       UUID actorId, String actorType) {
        Order order = findOrderOrThrow(orderId);
        OrderState fromState = order.getStatus();

        OrderState toState = stateMachineService.sendEvent(orderId, fromState, event);

        if (toState.equals(fromState)) {
            log.warn("Order {} state transition {} was rejected (state unchanged)", orderId, event);
            return;
        }

        order.setStatus(toState);
        orderRepository.save(order);

        addAuditEvent(order, event.name(), fromState.name(), toState.name(),
                "State transition via event " + event.name(), actorId, actorType, null);

        // Publish status-change event
        OrderStatusChangedEvent statusChangedEvent = OrderStatusChangedEvent.builder()
                .orderId(orderId.toString())
                .userId(order.getUserId().toString())
                .fromStatus(fromState.name())
                .toStatus(toState.name())
                .changedAt(LocalDateTime.now())
                .build();
        eventProducer.publishOrderStatusChanged(statusChangedEvent);

        // WebSocket notification
        trackingController.notifyOrderUpdate(orderId, toState.name());

        // Email notification on SHIPPED transition
        if (toState == OrderState.SHIPPED && order.getUserEmail() != null) {
            emailService.sendOrderShipped(order.getUserEmail(), order.getOrderNumber(), null);
        }

        // Publish review-eligible event on DELIVERED transition
        if (toState == OrderState.DELIVERED) {
            List<String> productIds = order.getItems().stream()
                    .map(item -> item.getProductId().toString())
                    .distinct()
                    .collect(Collectors.toList());
            OrderReviewEligibleEvent reviewEvent = OrderReviewEligibleEvent.builder()
                    .orderId(orderId.toString())
                    .userId(order.getUserId().toString())
                    .productIds(productIds)
                    .deliveredAt(LocalDateTime.now())
                    .build();
            eventProducer.publishOrderReviewEligible(reviewEvent);
            log.info("Published review-eligible event for order {} user {} products {}",
                    orderId, order.getUserId(), productIds);
        }

        log.info("Order {} transitioned from {} to {} via event {}", orderId, fromState, toState, event);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private Order findOrderOrThrow(UUID orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order not found: " + orderId));
    }

    private void validateOwnership(Order order, UUID userId) {
        if (!order.getUserId().equals(userId)) {
            throw new UnauthorizedException("Access denied to order: " + order.getId());
        }
    }

    private Map<String, Object> resolveShippingAddress(CheckoutRequest request) {
        if (request.getAddressSnapshot() != null && !request.getAddressSnapshot().isEmpty()) {
            return request.getAddressSnapshot();
        }
        // TODO: If addressId provided, call user-service via WebClient to fetch address
        // For now fall through to empty map to avoid blocking on missing service call
        if (request.getAddressId() != null) {
            log.warn("addressId {} provided but user-service lookup not yet wired; using empty address snapshot",
                    request.getAddressId());
        }
        return Map.of();
    }

    private String generateOrderNumber() {
        int year = LocalDateTime.now().getYear();
        int random = new SecureRandom().nextInt(90_000_000) + 10_000_000; // 8 digits
        return "ORD-" + year + "-" + random;
    }

    private OrderItem buildOrderItem(Order order, CartItem cartItem) {
        BigDecimal subtotal = cartItem.getUnitPrice()
                .multiply(BigDecimal.valueOf(cartItem.getQuantity()));

        return OrderItem.builder()
                .order(order)
                .skuId(UUID.fromString(cartItem.getSkuId()))
                .productId(UUID.fromString(cartItem.getProductId()))
                .productName(cartItem.getProductName())
                .skuCode(cartItem.getSkuCode())
                .variantName(cartItem.getVariantName())
                .quantity(cartItem.getQuantity())
                .unitPrice(cartItem.getUnitPrice())
                .subtotal(subtotal)
                .productSnapshot(Map.of(
                        "productName", cartItem.getProductName(),
                        "skuCode", cartItem.getSkuCode() != null ? cartItem.getSkuCode() : "",
                        "variantName", cartItem.getVariantName() != null ? cartItem.getVariantName() : "",
                        "unitPrice", cartItem.getUnitPrice().toString(),
                        "images", cartItem.getImages() != null ? cartItem.getImages() : List.of()
                ))
                .build();
    }

    private void addAuditEvent(Order order, String eventType, String fromStatus, String toStatus,
                               String description, UUID actorId, String actorType,
                               Map<String, Object> metadata) {
        OrderAuditEvent auditEvent = OrderAuditEvent.builder()
                .order(order)
                .eventType(eventType)
                .fromStatus(fromStatus)
                .toStatus(toStatus)
                .description(description)
                .actorId(actorId)
                .actorType(actorType)
                .metadata(metadata)
                .build();
        order.getEvents().add(auditEvent);
    }

    private OrderCreatedEvent buildOrderCreatedEvent(Order order) {
        List<OrderCreatedEvent.OrderItemEvent> itemEvents = order.getItems().stream()
                .map(item -> OrderCreatedEvent.OrderItemEvent.builder()
                        .skuId(item.getSkuId().toString())
                        .quantity(item.getQuantity())
                        .price(item.getUnitPrice())
                        .build())
                .collect(Collectors.toList());

        return OrderCreatedEvent.builder()
                .orderId(order.getId().toString())
                .userId(order.getUserId().toString())
                .items(itemEvents)
                .totalAmount(order.getTotalAmount())
                .createdAt(order.getCreatedAt())
                .build();
    }

    private InventoryReserveRequestedEvent buildInventoryReserveEvent(Order order) {
        List<InventoryReserveRequestedEvent.ReserveItem> reserveItems = order.getItems().stream()
                .map(item -> InventoryReserveRequestedEvent.ReserveItem.builder()
                        .skuId(item.getSkuId().toString())
                        .quantity(item.getQuantity())
                        .warehouseId(order.getWarehouseId() != null
                                ? order.getWarehouseId().toString() : null)
                        .build())
                .collect(Collectors.toList());

        return InventoryReserveRequestedEvent.builder()
                .orderId(order.getId().toString())
                .items(reserveItems)
                .build();
    }

    // ─── Admin Methods ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<AdminOrderSummaryResponse> getAllOrdersAdmin(Pageable pageable, String status) {
        Page<Order> orders = (status != null && !status.isBlank())
                ? orderRepository.findByStatus(OrderState.valueOf(status.toUpperCase()), pageable)
                : orderRepository.findAll(pageable);
        return orders.map(this::toAdminOrderSummary);
    }

    @Transactional(readOnly = true)
    public AdminOrderStatsResponse getOrderStats() {
        Map<String, Long> byStatus = java.util.Arrays.stream(OrderState.values())
                .collect(java.util.stream.Collectors.toMap(
                        OrderState::name,
                        orderRepository::countByStatus
                ));
        java.time.LocalDateTime startOfToday = java.time.LocalDate.now().atStartOfDay();
        java.time.LocalDateTime endOfToday   = startOfToday.plusDays(1);
        BigDecimal revenue = orderRepository.sumDeliveredRevenue();
        BigDecimal todayRevenue = orderRepository.sumDeliveredRevenueBetween(startOfToday, endOfToday);
        return AdminOrderStatsResponse.builder()
                .totalOrders(orderRepository.count())
                .totalRevenue(revenue != null ? revenue : BigDecimal.ZERO)
                .ordersByStatus(byStatus)
                .todayOrders(orderRepository.countCreatedBetween(startOfToday, endOfToday))
                .todayRevenue(todayRevenue != null ? todayRevenue : BigDecimal.ZERO)
                .build();
    }

    public OrderResponse adminUpdateOrderStatus(UUID orderId, String newStatus, UUID adminId) {
        Order order = findOrderOrThrow(orderId);
        OrderState from = order.getStatus();
        OrderState to = OrderState.valueOf(newStatus.toUpperCase());
        order.setStatus(to);
        orderRepository.save(order);
        addAuditEvent(order, "ADMIN_STATUS_UPDATE", from.name(), to.name(),
                "Admin manually updated status to " + to.name(), adminId, "ADMIN", null);

        // Publish side-effect events just as processStateTransition would
        OrderStatusChangedEvent statusChangedEvent = OrderStatusChangedEvent.builder()
                .orderId(orderId.toString())
                .userId(order.getUserId().toString())
                .fromStatus(from.name())
                .toStatus(to.name())
                .changedAt(LocalDateTime.now())
                .build();
        eventProducer.publishOrderStatusChanged(statusChangedEvent);
        trackingController.notifyOrderUpdate(orderId, to.name());

        if (to == OrderState.DELIVERED) {
            List<String> productIds = order.getItems().stream()
                    .map(item -> item.getProductId().toString())
                    .distinct()
                    .collect(Collectors.toList());
            OrderReviewEligibleEvent reviewEvent = OrderReviewEligibleEvent.builder()
                    .orderId(orderId.toString())
                    .userId(order.getUserId().toString())
                    .productIds(productIds)
                    .deliveredAt(LocalDateTime.now())
                    .build();
            eventProducer.publishOrderReviewEligible(reviewEvent);
            log.info("Admin set order {} to DELIVERED — published review-eligible event for user {} products {}",
                    orderId, order.getUserId(), productIds);
        }

        if (to == OrderState.SHIPPED && order.getUserEmail() != null) {
            emailService.sendOrderShipped(order.getUserEmail(), order.getOrderNumber(), null);
        }

        return orderMapper.toOrderResponse(order);
    }

    private AdminOrderSummaryResponse toAdminOrderSummary(Order order) {
        return AdminOrderSummaryResponse.builder()
                .id(order.getId())
                .orderNumber(order.getOrderNumber())
                .userId(order.getUserId())
                .status(order.getStatus())
                .subtotal(order.getSubtotal())
                .shippingFee(order.getShippingFee())
                .totalAmount(order.getTotalAmount())
                .paymentMethod(order.getPaymentMethod())
                .paymentStatus(order.getPaymentStatus() != null ? order.getPaymentStatus().name() : null)
                .itemCount(order.getItems() != null ? order.getItems().size() : 0)
                .shippingAddress(order.getShippingAddress())
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }
}
