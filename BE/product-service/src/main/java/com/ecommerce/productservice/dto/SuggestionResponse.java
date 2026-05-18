package com.ecommerce.productservice.dto;

import java.math.BigDecimal;

/**
 * Lightweight projection returned by the /products/suggest endpoint.
 */
public record SuggestionResponse(
        String id,
        String name,
        String thumbnail,
        BigDecimal price
) {}
