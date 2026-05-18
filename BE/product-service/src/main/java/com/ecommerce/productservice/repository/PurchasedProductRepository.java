package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.PurchasedProduct;
import com.ecommerce.productservice.entity.PurchasedProductId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PurchasedProductRepository extends JpaRepository<PurchasedProduct, PurchasedProductId> {

    boolean existsByIdUserIdAndIdProductId(UUID userId, UUID productId);
}
