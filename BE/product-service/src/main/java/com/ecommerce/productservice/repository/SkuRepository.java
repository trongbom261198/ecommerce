package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Sku;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SkuRepository extends JpaRepository<Sku, UUID> {

    List<Sku> findByProductId(UUID productId);

    Optional<Sku> findBySkuCode(String skuCode);

    boolean existsBySkuCode(String skuCode);
}
