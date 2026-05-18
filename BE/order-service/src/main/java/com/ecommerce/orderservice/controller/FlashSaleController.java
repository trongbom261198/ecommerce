package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.orderservice.dto.FlashSaleResponse;
import com.ecommerce.orderservice.service.FlashSaleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/flash-sales")
@RequiredArgsConstructor
@Tag(name = "Flash Sales", description = "Public flash sale endpoints")
public class FlashSaleController {

    private final FlashSaleService flashSaleService;

    @GetMapping
    @Operation(summary = "Get currently active flash sales")
    public ResponseEntity<ApiResponse<List<FlashSaleResponse>>> getActive() {
        return ResponseEntity.ok(ApiResponse.ok(flashSaleService.getActiveSales()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get flash sale details")
    public ResponseEntity<ApiResponse<FlashSaleResponse>> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(flashSaleService.getById(id)));
    }
}
