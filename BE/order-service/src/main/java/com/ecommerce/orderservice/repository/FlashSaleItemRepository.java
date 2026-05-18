package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.FlashSaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FlashSaleItemRepository extends JpaRepository<FlashSaleItem, UUID> {

    List<FlashSaleItem> findByFlashSaleId(UUID flashSaleId);

    Optional<FlashSaleItem> findByFlashSaleIdAndSkuId(UUID flashSaleId, UUID skuId);

    /** Atomically increment sold count — safe under concurrent writes. */
    @Modifying
    @Query("UPDATE FlashSaleItem i SET i.sold = i.sold + :qty WHERE i.id = :id AND i.sold + :qty <= i.quota")
    int incrementSold(UUID id, int qty);

    /** Restore sold count on order cancellation. */
    @Modifying
    @Query("UPDATE FlashSaleItem i SET i.sold = GREATEST(0, i.sold - :qty) WHERE i.id = :id")
    int decrementSold(UUID id, int qty);
}
