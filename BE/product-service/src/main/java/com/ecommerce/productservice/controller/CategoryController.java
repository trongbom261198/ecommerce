package com.ecommerce.productservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.CategoryRequest;
import com.ecommerce.productservice.dto.ProductResponse;
import com.ecommerce.productservice.service.CategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Tag(name = "Categories", description = "Product category management")
@RestController
@RequestMapping("/api/v1/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @Operation(summary = "Get all categories as a tree")
    @GetMapping
    public ResponseEntity<ApiResponse<List<CategoryDto>>> getAllCategories() {
        return ResponseEntity.ok(ApiResponse.ok(categoryService.getAllCategories()));
    }

    @Operation(summary = "Get a single category by ID")
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryDto>> getCategoryById(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(categoryService.getCategoryById(id)));
    }

    @Operation(summary = "Get paginated products for a category")
    @GetMapping("/{id}/products")
    public ResponseEntity<ApiResponse<PageResponse<ProductResponse>>> getCategoryProducts(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(ApiResponse.ok(categoryService.getCategoryProducts(id, pageable)));
    }

    @Operation(summary = "[ADMIN] Create a new category")
    @PostMapping
    public ResponseEntity<ApiResponse<CategoryDto>> createCategory(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @Valid @RequestBody CategoryRequest request) {
        requireAdmin(role);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Category created successfully", categoryService.createCategory(request)));
    }

    @Operation(summary = "[ADMIN] Update an existing category")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryDto>> updateCategory(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id,
            @Valid @RequestBody CategoryRequest request) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok("Category updated successfully", categoryService.updateCategory(id, request)));
    }

    @Operation(summary = "[ADMIN] Delete a category")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id) {
        requireAdmin(role);
        categoryService.deleteCategory(id);
        return ResponseEntity.ok(ApiResponse.okMessage("Category deleted successfully"));
    }

    private void requireAdmin(String role) {
        if (!"ADMIN".equalsIgnoreCase(role)) {
            throw new BusinessException(403, "FORBIDDEN", "Admin role required");
        }
    }
}
