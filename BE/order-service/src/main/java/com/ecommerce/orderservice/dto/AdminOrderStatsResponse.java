package com.ecommerce.orderservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminOrderStatsResponse {

    private long totalOrders;
    private BigDecimal totalRevenue;
    private Map<String, Long> ordersByStatus;
    private long todayOrders;
    private BigDecimal todayRevenue;
}
