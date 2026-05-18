package com.ecommerce.deliveryservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.deliveryservice.dto.ShipmentResponse;
import com.ecommerce.deliveryservice.dto.ShipmentStatusUpdateRequest;
import com.ecommerce.deliveryservice.dto.TrackingResponse;
import com.ecommerce.deliveryservice.entity.Shipment;
import com.ecommerce.deliveryservice.service.ShipmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/shipments")
@RequiredArgsConstructor
public class ShipmentController {

    private final ShipmentService shipmentService;

    /**
     * GET /api/v1/shipments/{id}
     * Retrieve shipment detail by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ShipmentResponse>> getShipment(@PathVariable UUID id) {
        ShipmentResponse response = shipmentService.getShipmentById(id);
        return ResponseEntity.ok(ApiResponse.<ShipmentResponse>builder()
                .success(true)
                .message("Shipment retrieved successfully")
                .data(response)
                .build());
    }

    /**
     * GET /api/v1/shipments/{id}/tracking
     * Retrieve tracking information for a shipment.
     */
    @GetMapping("/{id}/tracking")
    public ResponseEntity<ApiResponse<TrackingResponse>> getTracking(@PathVariable UUID id) {
        TrackingResponse tracking = shipmentService.getTracking(id);
        return ResponseEntity.ok(ApiResponse.<TrackingResponse>builder()
                .success(true)
                .message("Tracking info retrieved successfully")
                .data(tracking)
                .build());
    }

    /**
     * POST /api/v1/shipments/{id}/optimize-route
     * Trigger route optimisation for a shipment (Phase 2 ML placeholder).
     */
    @PostMapping("/{id}/optimize-route")
    public ResponseEntity<ApiResponse<String>> optimizeRoute(@PathVariable UUID id) {
        String routeData = shipmentService.optimizeRoute(id);
        return ResponseEntity.ok(ApiResponse.<String>builder()
                .success(true)
                .message("Route optimisation triggered")
                .data(routeData)
                .build());
    }

    /**
     * PUT /api/v1/shipments/{id}/status
     * Update shipment status (DRIVER/STAFF roles).
     */
    @PutMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ShipmentResponse>> updateStatus(
            @PathVariable UUID id,
            @RequestBody ShipmentStatusUpdateRequest request) {
        Shipment updated = shipmentService.updateStatus(id, request);
        ShipmentResponse response = shipmentService.getShipmentById(updated.getId());
        return ResponseEntity.ok(ApiResponse.<ShipmentResponse>builder()
                .success(true)
                .message("Shipment status updated successfully")
                .data(response)
                .build());
    }
}
