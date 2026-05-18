package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {

    Optional<Product> findBySlug(String slug);

    List<Product> findByEsSyncedFalseAndStatusNot(ProductStatus status);

    @Query("SELECT DISTINCT p FROM Product p LEFT JOIN FETCH p.skus WHERE p.status != com.ecommerce.productservice.entity.ProductStatus.DELETED")
    List<Product> findAllActiveWithSkus();

    @Modifying
    @Transactional
    @Query("UPDATE Product p SET p.esSynced = true WHERE p.id IN :ids")
    void markEsSynced(@Param("ids") List<UUID> ids);

    Page<Product> findByCategoryId(UUID categoryId, Pageable pageable);

    Page<Product> findByStatus(ProductStatus status, Pageable pageable);

    boolean existsBySlug(String slug);

    @Query("SELECT p FROM Product p WHERE p.category.id = :categoryId AND p.id <> :excludeId AND p.status = com.ecommerce.productservice.entity.ProductStatus.ACTIVE")
    List<Product> findRelatedProducts(@Param("categoryId") UUID categoryId, @Param("excludeId") UUID excludeId, Pageable pageable);

    @Query("SELECT DISTINCT p.brand FROM Product p WHERE p.brand IS NOT NULL AND p.brand <> '' AND p.status <> com.ecommerce.productservice.entity.ProductStatus.DELETED ORDER BY p.brand")
    List<String> findDistinctBrands();

    @Query("""
            SELECT p FROM Product p
            WHERE (:categoryId IS NULL OR p.category.id = :categoryId)
              AND (:brand IS NULL OR LOWER(p.brand) = LOWER(CAST(:brand AS String)))
              AND (:minPrice IS NULL OR p.basePrice >= :minPrice)
              AND (:maxPrice IS NULL OR p.basePrice <= :maxPrice)
              AND p.status <> com.ecommerce.productservice.entity.ProductStatus.DELETED
            """)
    Page<Product> findWithFilters(
            @Param("categoryId") UUID categoryId,
            @Param("brand") String brand,
            @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice,
            Pageable pageable
    );
}
