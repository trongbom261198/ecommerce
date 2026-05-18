package com.ecommerce.orderservice.dto;

import java.util.List;

public record ChatConfigResponse(
        boolean botEnabled,
        String welcomeMessage,
        String offlineMessage,
        List<ChatBotRule> botRules
) {}
