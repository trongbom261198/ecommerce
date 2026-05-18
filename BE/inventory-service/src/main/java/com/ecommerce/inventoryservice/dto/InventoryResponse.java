package com.ecommerce.inventoryservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryResponse {

    private UUID id;
    private UUID skuId;
    private String skuCode;
    private String productName;
    private UUID warehouseId;
    private String warehouseName;
    private int quantityOnHand;
    private int quantityReserved;
    private int availableQuantity;
    private int safetyStock;
}
