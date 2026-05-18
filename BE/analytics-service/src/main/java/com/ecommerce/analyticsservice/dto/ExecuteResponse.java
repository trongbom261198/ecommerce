package com.ecommerce.analyticsservice.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record ExecuteResponse(
        @JsonProperty("columns") List<String> columns,
        @JsonProperty("rows") List<List<Object>> rows,
        @JsonProperty("rowCount") int rowCount,
        @JsonProperty("executionMs") int executionMs,
        @JsonProperty("truncated") boolean truncated,
        @JsonProperty("error") String error
) {}
