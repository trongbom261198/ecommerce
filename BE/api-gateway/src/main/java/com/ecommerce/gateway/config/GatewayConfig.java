package com.ecommerce.gateway.config;

import com.ecommerce.gateway.filter.JwtAuthenticationFilter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, AppProperties.class})
public class GatewayConfig {

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(JwtProperties jwtProperties,
                                                           AppProperties appProperties) {
        return new JwtAuthenticationFilter(jwtProperties, appProperties);
    }
}
