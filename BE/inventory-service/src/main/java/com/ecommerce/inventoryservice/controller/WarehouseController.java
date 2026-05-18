package com.ecommerce.inventoryservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.inventoryservice.entity.Warehouse;
import com.ecommerce.inventoryservice.repository.WarehouseRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/warehouses")
@RequiredArgsConstructor
@Tag(name = "Warehouses", description = "Warehouse management endpoints")
public class WarehouseController {

    private final WarehouseRepository warehouseRepository;

    @GetMapping
    @Operation(summary = "List all active warehouses")
    public ResponseEntity<ApiResponse<List<Warehouse>>> listActiveWarehouses() {
        List<Warehouse> warehouses = warehouseRepository.findByActiveTrue();
        return ResponseEntity.ok(ApiResponse.ok(warehouses));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get warehouse details by ID")
    public ResponseEntity<ApiResponse<Warehouse>> getWarehouse(@PathVariable UUID id) {
        Warehouse warehouse = warehouseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Warehouse not found with id=" + id));
        return ResponseEntity.ok(ApiResponse.ok(warehouse));
    }
}
