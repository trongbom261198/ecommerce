package com.ecommerce.productservice.service;

import com.ecommerce.common.exception.ConflictException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.productservice.dto.ReviewRequest;
import com.ecommerce.productservice.dto.ReviewResponse;
import com.ecommerce.productservice.dto.ReviewSummaryResponse;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.PurchasedProduct;
import com.ecommerce.productservice.entity.PurchasedProductId;
import com.ecommerce.productservice.entity.Review;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.PurchasedProductRepository;
import com.ecommerce.productservice.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final PurchasedProductRepository purchasedProductRepository;
    private final ProductRepository productRepository;
    private final ElasticsearchSyncService elasticsearchSyncService;
    private final JdbcTemplate jdbcTemplate;

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ReviewSummaryResponse getSummary(UUID productId, UUID currentUserId) {
        Product product = findProductOrThrow(productId);

        boolean canReview = false;
        if (currentUserId != null) {
            boolean alreadyReviewed = reviewRepository
                    .existsByProductIdAndUserId(productId, currentUserId);
            canReview = !alreadyReviewed;
        }

        Map<Integer, Long> distribution = buildDistribution(productId);

        return ReviewSummaryResponse.builder()
                .averageRating(product.getAvgRating() != null ? product.getAvgRating().doubleValue() : 0.0)
                .totalReviews(product.getReviewCount())
                .distribution(distribution)
                .canReview(canReview)
                .build();
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> listReviews(UUID productId, Pageable pageable) {
        findProductOrThrow(productId);
        return reviewRepository.findByProductId(productId, pageable)
                .map(this::toResponse);
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    public ReviewResponse create(UUID productId, UUID userId, String userName, ReviewRequest req) {
        findProductOrThrow(productId);

        if (reviewRepository.existsByProductIdAndUserId(productId, userId)) {
            throw new ConflictException("REVIEW_EXISTS", "You have already reviewed this product");
        }

        Review review = Review.builder()
                .productId(productId)
                .userId(userId)
                .userName(userName)
                .rating((short) req.getRating().intValue())
                .comment(req.getComment())
                .build();

        Review saved = reviewRepository.save(review);
        recalculateAggregates(productId);
        return toResponse(saved);
    }

    public ReviewResponse update(UUID reviewId, UUID userId, ReviewRequest req) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new NotFoundException("REVIEW_NOT_FOUND", "Review not found: " + reviewId));

        if (!review.getUserId().equals(userId)) {
            throw new UnauthorizedException("You do not own this review");
        }

        review.setRating((short) req.getRating().intValue());
        review.setComment(req.getComment());
        Review saved = reviewRepository.save(review);
        recalculateAggregates(review.getProductId());
        return toResponse(saved);
    }

    public void delete(UUID reviewId, UUID userId, String role) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new NotFoundException("REVIEW_NOT_FOUND", "Review not found: " + reviewId));

        boolean isAdmin = "ADMIN".equalsIgnoreCase(role);
        if (!isAdmin && !review.getUserId().equals(userId)) {
            throw new UnauthorizedException("You do not own this review");
        }

        UUID productId = review.getProductId();
        reviewRepository.delete(review);
        recalculateAggregates(productId);
    }

    // ── Kafka consumer helper ─────────────────────────────────────────────────

    public void markPurchased(String userIdStr, List<String> productIdStrs) {
        UUID userId = UUID.fromString(userIdStr);
        for (String productIdStr : productIdStrs) {
            try {
                UUID productId = UUID.fromString(productIdStr);
                PurchasedProductId key = new PurchasedProductId(userId, productId);
                if (!purchasedProductRepository.existsById(key)) {
                    PurchasedProduct pp = PurchasedProduct.builder()
                            .id(key)
                            .firstDeliveredAt(LocalDateTime.now())
                            .build();
                    purchasedProductRepository.save(pp);
                }
            } catch (Exception e) {
                log.warn("Failed to mark product {} as purchased for user {}: {}",
                        productIdStr, userIdStr, e.getMessage());
            }
        }
        log.debug("Marked {} products as purchased for user {}", productIdStrs.size(), userIdStr);
    }

    // ── Aggregates ────────────────────────────────────────────────────────────

    void recalculateAggregates(UUID productId) {
        jdbcTemplate.update("""
                UPDATE products
                SET avg_rating   = COALESCE((SELECT AVG(rating)   FROM reviews WHERE product_id = ?), 0),
                    review_count = COALESCE((SELECT COUNT(*)       FROM reviews WHERE product_id = ?), 0)
                WHERE id = ?
                """, productId, productId, productId);

        productRepository.findById(productId).ifPresent(product -> {
            try {
                elasticsearchSyncService.syncProduct(product);
            } catch (Exception e) {
                log.warn("ES sync failed after review recalculation for product {}: {}", productId, e.getMessage());
            }
        });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private Product findProductOrThrow(UUID productId) {
        return productRepository.findById(productId)
                .orElseThrow(() -> new NotFoundException("PRODUCT_NOT_FOUND", "Product not found: " + productId));
    }

    private ReviewResponse toResponse(Review review) {
        return ReviewResponse.builder()
                .id(review.getId())
                .productId(review.getProductId())
                .userId(review.getUserId())
                .userName(review.getUserName())
                .rating(review.getRating())
                .comment(review.getComment())
                .createdAt(review.getCreatedAt())
                .updatedAt(review.getUpdatedAt())
                .build();
    }

    private Map<Integer, Long> buildDistribution(UUID productId) {
        Map<Integer, Long> distribution = new HashMap<>();
        // Initialise all stars to 0 so the FE always gets a complete map
        for (int i = 1; i <= 5; i++) distribution.put(i, 0L);

        List<Object[]> rows = reviewRepository.countByRatingForProduct(productId);
        for (Object[] row : rows) {
            int star = ((Number) row[0]).intValue();
            long count = ((Number) row[1]).longValue();
            distribution.put(star, count);
        }
        return distribution;
    }
}
