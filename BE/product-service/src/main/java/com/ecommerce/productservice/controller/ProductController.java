package com.ecommerce.productservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.ProductRequest;
import com.ecommerce.productservice.dto.ProductResponse;
import com.ecommerce.productservice.dto.ProductSearchRequest;
import com.ecommerce.productservice.dto.SkuRequest;
import com.ecommerce.productservice.dto.SkuResponse;
import com.ecommerce.productservice.service.CategoryService;
import com.ecommerce.productservice.service.MinioService;
import com.ecommerce.productservice.service.ProductService;
import com.ecommerce.productservice.service.ProductSuggestService;
import com.ecommerce.productservice.dto.SuggestionResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.ecommerce.common.exception.BusinessException;
import org.springframework.web.bind.annotation.DeleteMapping;
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
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name = "Products", description = "Product and category endpoints")
public class ProductController {

    private final ProductService productService;
    private final CategoryService categoryService;
    private final MinioService minioService;
    private final ProductSuggestService suggestService;

    // ── Products ──────────────────────────────────────────────────────────────

    @GetMapping("/products")
    @Operation(summary = "Search / list products")
    public ResponseEntity<ApiResponse<PageResponse<ProductResponse>>> getProducts(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false, defaultValue = "desc") String sortDir,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {

        ProductSearchRequest request = ProductSearchRequest.builder()
                .q(q)
                .categoryId(category)
                .minPrice(minPrice)
                .maxPrice(maxPrice)
                .brand(brand)
                .sortBy(sort)
                .sortDir(sortDir)
                .page(page)
                .size(size)
                .build();

        PageResponse<ProductResponse> result = productService.getProducts(request);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/products/{id}")
    @Operation(summary = "Get product by ID")
    public ResponseEntity<ApiResponse<ProductResponse>> getProductById(@PathVariable UUID id) {
        ProductResponse product = productService.getProductById(id);
        return ResponseEntity.ok(ApiResponse.ok(product));
    }

    @GetMapping("/products/brands")
    @Operation(summary = "Get list of distinct product brands")
    public ResponseEntity<ApiResponse<List<String>>> getBrands() {
        return ResponseEntity.ok(ApiResponse.ok(productService.getBrands()));
    }

    @GetMapping("/products/{id}/related")
    @Operation(summary = "Get related products in the same category")
    public ResponseEntity<ApiResponse<List<ProductResponse>>> getRelatedProducts(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "6") int limit) {
        List<ProductResponse> related = productService.getRelatedProducts(id, Math.min(limit, 12));
        return ResponseEntity.ok(ApiResponse.ok(related));
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new product (ADMIN only)")
    public ResponseEntity<ApiResponse<ProductResponse>> createProduct(
            @Valid @RequestBody ProductRequest request,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        ProductResponse created = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Product created successfully", created));
    }

    @PutMapping("/products/{id}")
    @Operation(summary = "Update a product (ADMIN only)")
    public ResponseEntity<ApiResponse<ProductResponse>> updateProduct(
            @PathVariable UUID id,
            @Valid @RequestBody ProductRequest request,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        ProductResponse updated = productService.updateProduct(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Product updated successfully", updated));
    }

    @DeleteMapping("/products/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a product (ADMIN only)")
    public ResponseEntity<Void> deleteProduct(
            @PathVariable UUID id,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/products/{id}/skus")
    @Operation(summary = "Get all SKUs for a product")
    public ResponseEntity<ApiResponse<List<SkuResponse>>> getProductSkus(@PathVariable UUID id) {
        List<SkuResponse> skus = productService.getSkusByProductId(id);
        return ResponseEntity.ok(ApiResponse.ok(skus));
    }

    @PostMapping("/products/{productId}/skus")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a SKU to a product (ADMIN only)")
    public ResponseEntity<ApiResponse<SkuResponse>> createSku(
            @PathVariable UUID productId,
            @Valid @RequestBody SkuRequest request,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(productService.createSku(productId, request)));
    }

    @PutMapping("/products/{productId}/skus/{skuId}")
    @Operation(summary = "Update a SKU (ADMIN only)")
    public ResponseEntity<ApiResponse<SkuResponse>> updateSku(
            @PathVariable UUID productId,
            @PathVariable UUID skuId,
            @Valid @RequestBody SkuRequest request,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(productService.updateSku(productId, skuId, request)));
    }

    @DeleteMapping("/products/{productId}/skus/{skuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a SKU (ADMIN only)")
    public ResponseEntity<Void> deleteSku(
            @PathVariable UUID productId,
            @PathVariable UUID skuId,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        productService.deleteSku(productId, skuId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/products/es-resync")
    @Operation(summary = "Force full re-index of all products to Elasticsearch (ADMIN only)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resyncElasticsearch(
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        int count = productService.resyncAllToElasticsearch();
        return ResponseEntity.ok(ApiResponse.ok("ES resync complete", Map.of("indexed", count)));
    }

    @PostMapping(value = "/products/upload-image", consumes = "multipart/form-data")
    @Operation(summary = "Upload product image to MinIO (ADMIN only)")
    public ResponseEntity<ApiResponse<Map<String, String>>> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestHeader("X-User-Role") String role) {
        requireAdmin(role);
        if (file.isEmpty()) {
            throw new BusinessException(400, "INVALID_FILE", "File must not be empty");
        }
        String url = minioService.uploadFile(file);
        return ResponseEntity.ok(ApiResponse.ok("Image uploaded successfully", Map.of("url", url)));
    }

    @GetMapping("/products/suggest")
    @Operation(summary = "Autocomplete product suggestions")
    public ResponseEntity<ApiResponse<List<SuggestionResponse>>> suggest(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false, defaultValue = "8") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(suggestService.suggest(q, limit)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void requireAdmin(String role) {
        if (!"ADMIN".equalsIgnoreCase(role)) {
            throw new BusinessException(403, "FORBIDDEN", "Admin role required");
        }
    }

    // ── Categories ────────────────────────────────────────────────────────────

//    @GetMapping("/categories")
//    @Operation(summary = "List all categories")
//    public ResponseEntity<ApiResponse<List<CategoryDto>>> getAllCategories() {
//        List<CategoryDto> categories = categoryService.getAllCategories();
//        return ResponseEntity.ok(ApiResponse.ok(categories));
//    }

//    @GetMapping("/categories/{id}/products")
//    @Operation(summary = "Get products in a category")
//    public ResponseEntity<ApiResponse<PageResponse<ProductResponse>>> getCategoryProducts(
//            @PathVariable UUID id,
//            @RequestParam(required = false, defaultValue = "0") int page,
//            @RequestParam(required = false, defaultValue = "20") int size) {
//
//        Pageable pageable = PageRequest.of(page, size);
//        PageResponse<ProductResponse> result = categoryService.getCategoryProducts(id, pageable);
//        return ResponseEntity.ok(ApiResponse.ok(result));
//    }
}
