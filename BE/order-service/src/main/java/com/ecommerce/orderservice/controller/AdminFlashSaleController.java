package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.orderservice.dto.FlashSaleRequest;
import com.ecommerce.orderservice.dto.FlashSaleResponse;
import com.ecommerce.orderservice.service.FlashSaleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/flash-sales")
@RequiredArgsConstructor
@Tag(name = "Admin - Flash Sales", description = "Flash sale campaign management")
public class AdminFlashSaleController {

    private final FlashSaleService flashSaleService;

    @PostMapping
    @Operation(summary = "Create flash sale")
    public ResponseEntity<ApiResponse<FlashSaleResponse>> create(
            @Valid @RequestBody FlashSaleRequest req,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestHeader(value = "X-User-Id",   defaultValue = "") String userId) {
        requireAdmin(role);
        FlashSaleResponse resp = flashSaleService.create(req, UUID.fromString(userId));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok("Flash sale created", resp));
    }

    @GetMapping
    @Operation(summary = "List all flash sales (paginated)")
    public ResponseEntity<ApiResponse<PageResponse<FlashSaleResponse>>> list(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        requireAdmin(role);
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(ApiResponse.ok(PageResponse.from(flashSaleService.listAll(pageable))));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get flash sale by ID")
    public ResponseEntity<ApiResponse<FlashSaleResponse>> getById(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(flashSaleService.getById(id)));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update flash sale (only DRAFT/SCHEDULED allowed)")
    public ResponseEntity<ApiResponse<FlashSaleResponse>> update(
            @PathVariable UUID id,
            @Valid @RequestBody FlashSaleRequest req,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok("Updated", flashSaleService.update(id, req)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Cancel flash sale")
    public ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        flashSaleService.cancel(id);
        return ResponseEntity.ok(ApiResponse.ok("Flash sale cancelled", null));
    }

    @PostMapping("/{id}/activate")
    @Operation(summary = "Manually activate a SCHEDULED flash sale")
    public ResponseEntity<ApiResponse<Void>> activate(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        flashSaleService.activate(id);
        return ResponseEntity.ok(ApiResponse.ok("Flash sale activated", null));
    }

    @PostMapping("/{id}/end")
    @Operation(summary = "Manually end an ACTIVE flash sale")
    public ResponseEntity<ApiResponse<Void>> end(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        flashSaleService.end(id);
        return ResponseEntity.ok(ApiResponse.ok("Flash sale ended", null));
    }

    private void requireAdmin(String role) {
        if (!"ADMIN".equals(role)) throw new UnauthorizedException("Admin access required");
    }
}
