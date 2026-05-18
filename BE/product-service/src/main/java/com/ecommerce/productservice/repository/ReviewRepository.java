package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Review;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.UUID;

@Repository
public interface ReviewRepository extends JpaRepository<Review, UUID> {

    Page<Review> findByProductId(UUID productId, Pageable pageable);

    boolean existsByProductIdAndUserId(UUID productId, UUID userId);

    void deleteByIdAndUserId(UUID id, UUID userId);

    @Query("""
            SELECT r.rating AS rating, COUNT(r) AS cnt
            FROM Review r
            WHERE r.productId = :productId
            GROUP BY r.rating
            """)
    java.util.List<Object[]> countByRatingForProduct(@Param("productId") UUID productId);
}
