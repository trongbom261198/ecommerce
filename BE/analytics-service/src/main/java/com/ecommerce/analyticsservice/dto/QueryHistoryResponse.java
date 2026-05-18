package com.ecommerce.analyticsservice.dto;

import com.ecommerce.analyticsservice.domain.QueryHistory;

import java.time.Instant;
import java.util.UUID;

public record QueryHistoryResponse(
        UUID id,
        String language,
        String code,
        Integer rowCount,
        Integer execMs,
        String status,
        String errorMsg,
        Instant createdAt
) {
    public static QueryHistoryResponse from(QueryHistory h) {
        return new QueryHistoryResponse(
                h.getId(), h.getLanguage(), h.getCode(),
                h.getRowCount(), h.getExecMs(), h.getStatus(),
                h.getErrorMsg(), h.getCreatedAt()
        );
    }
}
