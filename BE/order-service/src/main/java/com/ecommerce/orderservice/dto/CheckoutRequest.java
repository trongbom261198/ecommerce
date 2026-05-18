package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

@Data
public class CheckoutRequest {

    /** Optional: ID of a saved address in user-service. */
    private UUID addressId;

    /** Optional: inline address snapshot — used when no addressId is provided. */
    private Map<String, Object> addressSnapshot;

    @NotBlank(message = "Payment method is required")
    private String paymentMethod;

    private String notes;

    private UUID warehouseId;

    /** Optional: apply a flash sale discount to this order. */
    private UUID flashSaleId;

    /** SKU targeted by the flash sale (required when flashSaleId is set). */
    private UUID flashSaleSkuId;
}
