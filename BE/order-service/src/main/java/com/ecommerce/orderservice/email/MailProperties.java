package com.ecommerce.orderservice.email;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app.mail")
public class MailProperties {
    private String from = "noreply@ecommerce.local";
    private String fromName = "E-Commerce";
    private boolean enabled = true;
}
