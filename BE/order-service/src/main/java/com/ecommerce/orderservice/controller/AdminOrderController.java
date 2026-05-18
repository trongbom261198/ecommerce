package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.orderservice.dto.AdminOrderStatsResponse;
import com.ecommerce.orderservice.dto.AdminOrderSummaryResponse;
import com.ecommerce.orderservice.dto.OrderResponse;
import com.ecommerce.orderservice.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/orders")
@RequiredArgsConstructor
@Tag(name = "Admin - Orders", description = "Admin order management")
public class AdminOrderController {

    private final OrderService orderService;

    @GetMapping
    @Operation(summary = "List all orders (admin)")
    public ResponseEntity<ApiResponse<PageResponse<AdminOrderSummaryResponse>>> getAllOrders(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestHeader(value = "X-User-Id", defaultValue = "") String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        checkAdmin(role);
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResponse<AdminOrderSummaryResponse> result = PageResponse.from(
                orderService.getAllOrdersAdmin(pageable, status));
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/stats")
    @Operation(summary = "Get order statistics")
    public ResponseEntity<ApiResponse<AdminOrderStatsResponse>> getOrderStats(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        checkAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(orderService.getOrderStats()));
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "Update order status (admin override)")
    public ResponseEntity<ApiResponse<OrderResponse>> updateOrderStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestHeader(value = "X-User-Id", defaultValue = "") String userId) {
        checkAdmin(role);
        String newStatus = body.get("status");
        OrderResponse order = orderService.adminUpdateOrderStatus(id, newStatus, UUID.fromString(userId));
        return ResponseEntity.ok(ApiResponse.ok("Order status updated", order));
    }

    private void checkAdmin(String role) {
        if (!"ADMIN".equals(role)) {
            throw new UnauthorizedException("Admin access required");
        }
    }
}
