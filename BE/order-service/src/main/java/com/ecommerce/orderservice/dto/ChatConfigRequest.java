package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ChatConfigRequest(
        boolean botEnabled,
        @NotBlank @Size(max = 500) String welcomeMessage,
        @NotBlank @Size(max = 500) String offlineMessage,
        List<ChatBotRule> botRules
) {}
