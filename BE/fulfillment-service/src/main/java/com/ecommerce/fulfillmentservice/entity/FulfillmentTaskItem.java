package com.ecommerce.fulfillmentservice.entity;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Embeddable
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FulfillmentTaskItem {

    private UUID skuId;
    private String skuCode;
    private int quantity;
    private int pickedQuantity;
}
