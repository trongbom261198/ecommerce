package com.ecommerce.inventoryservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.inventoryservice.dto.InventoryAdjustRequest;
import com.ecommerce.inventoryservice.dto.InventoryResponse;
import com.ecommerce.inventoryservice.dto.ReleaseRequest;
import com.ecommerce.inventoryservice.dto.ReserveRequest;
import com.ecommerce.inventoryservice.service.InventoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory")
@RequiredArgsConstructor
@Tag(name = "Inventory", description = "Inventory management endpoints")
public class InventoryController {

    private final InventoryService inventoryService;

    @GetMapping
    @Operation(summary = "Get inventory records with optional filtering by skuId and/or warehouseId")
    public ResponseEntity<ApiResponse<PageResponse<InventoryResponse>>> getInventory(
            @RequestParam(required = false) UUID skuId,
            @RequestParam(required = false) UUID warehouseId,
            @PageableDefault(size = 20) Pageable pageable) {

        Page<InventoryResponse> page = inventoryService.getInventory(skuId, warehouseId, pageable);
        return ResponseEntity.ok(ApiResponse.ok(PageResponse.from(page)));
    }

    @PostMapping("/adjust")
    @Operation(summary = "Adjust stock quantity for a SKU in a warehouse (admin operation)")
    public ResponseEntity<ApiResponse<InventoryResponse>> adjustStock(
            @Valid @RequestBody InventoryAdjustRequest request) {

        InventoryResponse response = inventoryService.adjust(request);
        return ResponseEntity.ok(ApiResponse.ok("Stock adjusted successfully", response));
    }

    @PostMapping("/reserve")
    @Operation(summary = "Reserve stock for an order (internal use)")
    public ResponseEntity<ApiResponse<Void>> reserveStock(
            @Valid @RequestBody ReserveRequest request) {

        inventoryService.reserveStock(request);
        return ResponseEntity.ok(ApiResponse.okMessage("Stock reservation initiated"));
    }

    @PostMapping("/release")
    @Operation(summary = "Release reserved stock (internal use — order cancelled or fulfilled)")
    public ResponseEntity<ApiResponse<Void>> releaseStock(
            @Valid @RequestBody ReleaseRequest request) {

        inventoryService.releaseStock(request);
        return ResponseEntity.ok(ApiResponse.okMessage("Stock released successfully"));
    }
}
