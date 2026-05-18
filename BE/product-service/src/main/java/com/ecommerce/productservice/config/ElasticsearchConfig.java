package com.ecommerce.productservice.config;

import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;

/**
 * Provides a JacksonJsonpMapper with JavaTimeModule so the low-level
 * co.elastic.clients can deserialize LocalDateTime / BigDecimal correctly.
 *
 * Spring Boot's ElasticsearchClientAutoConfiguration is @ConditionalOnMissingBean(JsonpMapper),
 * so this bean takes precedence without causing a duplicate ElasticsearchClient.
 */
@Configuration
public class ElasticsearchConfig {

    /**
     * Flexible formatter handles all ES date formats:
     *   "2026-04-30"                  (date-only, stored by old index)
     *   "2026-04-30T02:48:50"         (no millis)
     *   "2026-04-30T02:48:50.621"     (millis)
     *   "2026-04-30T02:48:50.621605"  (micros, PostgreSQL precision)
     */
    private static final DateTimeFormatter FLEXIBLE_FORMATTER = new DateTimeFormatterBuilder()
            .appendPattern("yyyy-MM-dd")
            .optionalStart()
            .appendPattern("['T'][' ']HH:mm:ss")
            .optionalStart()
            .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
            .optionalEnd()
            .optionalStart()
            .appendPattern("XXX")   // timezone offset like +07:00 — parsed but ignored for LocalDateTime
            .optionalEnd()
            .optionalEnd()
            .parseDefaulting(ChronoField.HOUR_OF_DAY, 0)
            .parseDefaulting(ChronoField.MINUTE_OF_HOUR, 0)
            .parseDefaulting(ChronoField.SECOND_OF_MINUTE, 0)
            .toFormatter();

    @Bean
    public JacksonJsonpMapper jacksonJsonpMapper() {
        JavaTimeModule timeModule = new JavaTimeModule();
        timeModule.addDeserializer(LocalDateTime.class,
                new LocalDateTimeDeserializer(FLEXIBLE_FORMATTER));
        timeModule.addSerializer(LocalDateTime.class,
                new LocalDateTimeSerializer(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        ObjectMapper mapper = new ObjectMapper()
                .registerModule(timeModule)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

        return new JacksonJsonpMapper(mapper);
    }
}
