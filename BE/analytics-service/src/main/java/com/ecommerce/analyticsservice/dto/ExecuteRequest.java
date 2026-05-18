package com.ecommerce.analyticsservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ExecuteRequest(
        @NotBlank @Pattern(regexp = "sql|python|r") String language,
        @NotBlank @Size(max = 50_000) String code,
        Integer timeout
) {}
