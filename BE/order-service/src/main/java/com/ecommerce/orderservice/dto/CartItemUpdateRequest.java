package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class CartItemUpdateRequest {

    @Min(value = 0, message = "Quantity must be 0 or greater (0 removes the item)")
    private int quantity;
}
