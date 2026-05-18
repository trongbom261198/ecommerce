package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.dto.InventoryProjection;
import com.ecommerce.inventoryservice.entity.Inventory;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface InventoryRepository extends JpaRepository<Inventory, UUID> {

    Optional<Inventory> findBySkuIdAndWarehouseId(UUID skuId, UUID warehouseId);

    List<Inventory> findBySkuId(UUID skuId);

    List<Inventory> findByWarehouseId(UUID warehouseId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inventory i WHERE i.skuId = :skuId AND i.warehouse.id = :warehouseId")
    Optional<Inventory> findBySkuIdAndWarehouseIdForUpdate(
            @Param("skuId") UUID skuId,
            @Param("warehouseId") UUID warehouseId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inventory i WHERE i.skuId = :skuId ORDER BY i.quantityOnHand DESC")
    List<Inventory> findBySkuIdForUpdate(@Param("skuId") UUID skuId);

    @Query(value = """
            SELECT i.id, i.sku_id, i.warehouse_id,
                   w.name AS warehouse_name,
                   COALESCE(s.sku_code, '') AS sku_code,
                   COALESCE(p.name, '') AS product_name,
                   i.quantity_on_hand, i.quantity_reserved, i.safety_stock
            FROM inventory i
            JOIN warehouses w ON w.id = i.warehouse_id
            LEFT JOIN skus s ON s.id = i.sku_id
            LEFT JOIN products p ON p.id = s.product_id
            WHERE (:skuId IS NULL OR i.sku_id = :skuId)
              AND (:warehouseId IS NULL OR i.warehouse_id = :warehouseId)
            """,
            countQuery = """
            SELECT COUNT(*) FROM inventory i
            WHERE (:skuId IS NULL OR i.sku_id = :skuId)
              AND (:warehouseId IS NULL OR i.warehouse_id = :warehouseId)
            """,
            nativeQuery = true)
    Page<InventoryProjection> findAllWithDetails(
            @Param("skuId") UUID skuId,
            @Param("warehouseId") UUID warehouseId,
            Pageable pageable);
}
