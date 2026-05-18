package com.ecommerce.inventoryservice.dto;

import java.util.UUID;

/** Native-query projection for inventory list with SKU and product details. */
public interface InventoryProjection {
    UUID getId();
    UUID getSkuId();
    UUID getWarehouseId();
    String getWarehouseName();
    String getSkuCode();
    String getProductName();
    int getQuantityOnHand();
    int getQuantityReserved();
    int getSafetyStock();
}
