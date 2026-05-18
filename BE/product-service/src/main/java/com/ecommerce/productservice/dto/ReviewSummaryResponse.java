package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReviewSummaryResponse {

    private double averageRating;
    private int totalReviews;
    /** Distribution of ratings: key = star count (1-5), value = number of reviews */
    private Map<Integer, Long> distribution;
    /** True when the current user has purchased the product, has not yet reviewed it, and is authenticated */
    private boolean canReview;
}
