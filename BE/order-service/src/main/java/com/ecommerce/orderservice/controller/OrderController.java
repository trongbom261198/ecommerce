package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.orderservice.dto.CheckoutRequest;
import com.ecommerce.orderservice.dto.OrderResponse;
import com.ecommerce.orderservice.dto.OrderSummaryResponse;
import com.ecommerce.orderservice.dto.OrderTrackingResponse;
import com.ecommerce.orderservice.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Tag(name = "Orders", description = "Order management endpoints")
public class OrderController {

    private final OrderService orderService;

    @GetMapping
    @Operation(summary = "List orders for the current user (paginated)")
    public ResponseEntity<ApiResponse<PageResponse<OrderSummaryResponse>>> getOrders(
            @RequestHeader("X-User-Id") String userId,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {

        Pageable pageable = PageRequest.of(page, size);
        PageResponse<OrderSummaryResponse> result = PageResponse.from(
                orderService.getOrders(UUID.fromString(userId), pageable));
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get order detail by ID")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrderById(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") String userId) {

        OrderResponse order = orderService.getOrderById(id, UUID.fromString(userId));
        return ResponseEntity.ok(ApiResponse.ok(order));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Checkout / create a new order from the current cart")
    public ResponseEntity<ApiResponse<OrderResponse>> checkout(
            @Valid @RequestBody CheckoutRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = "X-User-Email", required = false, defaultValue = "") String userEmail) {
        OrderResponse order = orderService.checkout(UUID.fromString(userId), request, userEmail);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Order placed successfully", order));
    }

    @PostMapping("/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Checkout alias — same as POST /orders")
    public ResponseEntity<ApiResponse<OrderResponse>> checkoutAlias(
            @Valid @RequestBody CheckoutRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = "X-User-Email", required = false, defaultValue = "") String userEmail) {
        OrderResponse order = orderService.checkout(UUID.fromString(userId), request, userEmail);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Order placed successfully", order));
    }

    @PutMapping("/{id}/cancel")
    @Operation(summary = "Cancel an order")
    public ResponseEntity<ApiResponse<Void>> cancelOrder(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") String userId) {

        orderService.cancelOrder(id, UUID.fromString(userId));
        return ResponseEntity.ok(ApiResponse.okMessage("Order cancelled successfully"));
    }

    @GetMapping("/{id}/tracking")
    @Operation(summary = "Get tracking info and event history for an order")
    public ResponseEntity<ApiResponse<OrderTrackingResponse>> getOrderTracking(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") String userId) {

        OrderTrackingResponse tracking = orderService.getOrderTracking(id, UUID.fromString(userId));
        return ResponseEntity.ok(ApiResponse.ok(tracking));
    }
}
