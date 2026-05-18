package com.ecommerce.productservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.productservice.dto.ReviewRequest;
import com.ecommerce.productservice.dto.ReviewResponse;
import com.ecommerce.productservice.dto.ReviewSummaryResponse;
import com.ecommerce.productservice.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/products/{productId}/reviews")
@RequiredArgsConstructor
@Tag(name = "Reviews", description = "Product review endpoints")
public class ReviewController {

    private final ReviewService reviewService;

    @GetMapping
    @Operation(summary = "List paginated reviews for a product")
    public ResponseEntity<ApiResponse<PageResponse<ReviewResponse>>> listReviews(
            @PathVariable UUID productId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<ReviewResponse> result = reviewService.listReviews(productId, pageable);
        return ResponseEntity.ok(ApiResponse.ok(PageResponse.from(result)));
    }

    @GetMapping("/summary")
    @Operation(summary = "Get review summary (avg rating, distribution, canReview)")
    public ResponseEntity<ApiResponse<ReviewSummaryResponse>> getSummary(
            @PathVariable UUID productId,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {

        UUID currentUserId = userIdHeader != null && !userIdHeader.isBlank()
                ? UUID.fromString(userIdHeader) : null;
        ReviewSummaryResponse summary = reviewService.getSummary(productId, currentUserId);
        return ResponseEntity.ok(ApiResponse.ok(summary));
    }

    @PostMapping
    @Operation(summary = "Create a review (auth required, must have purchased the product)")
    public ResponseEntity<ApiResponse<ReviewResponse>> createReview(
            @PathVariable UUID productId,
            @Valid @RequestBody ReviewRequest request,
            @RequestHeader("X-User-Id") String userIdHeader,
            @RequestHeader(value = "X-User-Name", required = false) String userName) {

        UUID userId = UUID.fromString(userIdHeader);
        String resolvedName = (userName != null && !userName.isBlank()) ? userName : "Người dùng";
        ReviewResponse created = reviewService.create(productId, userId, resolvedName, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok("Review created", created));
    }

    @PutMapping("/{reviewId}")
    @Operation(summary = "Update own review (auth required)")
    public ResponseEntity<ApiResponse<ReviewResponse>> updateReview(
            @PathVariable UUID productId,
            @PathVariable UUID reviewId,
            @Valid @RequestBody ReviewRequest request,
            @RequestHeader("X-User-Id") String userIdHeader) {

        UUID userId = UUID.fromString(userIdHeader);
        ReviewResponse updated = reviewService.update(reviewId, userId, request);
        return ResponseEntity.ok(ApiResponse.ok("Review updated", updated));
    }

    @DeleteMapping("/{reviewId}")
    @Operation(summary = "Delete own review or any review (ADMIN)")
    public ResponseEntity<Void> deleteReview(
            @PathVariable UUID productId,
            @PathVariable UUID reviewId,
            @RequestHeader("X-User-Id") String userIdHeader,
            @RequestHeader(value = "X-User-Role", required = false) String role) {

        UUID userId = UUID.fromString(userIdHeader);
        reviewService.delete(reviewId, userId, role);
        return ResponseEntity.noContent().build();
    }
}
