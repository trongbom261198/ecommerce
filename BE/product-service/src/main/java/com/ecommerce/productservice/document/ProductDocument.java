package com.ecommerce.productservice.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Document(indexName = "products")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductDocument {

    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;

    @Field(type = FieldType.Text, analyzer = "standard")
    private String description;

    @Field(type = FieldType.Keyword)
    private String brand;

    @Field(type = FieldType.Keyword)
    private String categoryId;

    @Field(type = FieldType.Keyword)
    private String categoryName;

    @Field(type = FieldType.Double)
    private BigDecimal basePrice;

    @Field(type = FieldType.Double)
    private BigDecimal minSkuPrice;

    @Field(type = FieldType.Double)
    private BigDecimal maxSkuPrice;

    @Field(type = FieldType.Keyword)
    private String status;

    @Field(type = FieldType.Keyword)
    private List<String> images;

    @Field(type = FieldType.Object, enabled = false)
    private Map<String, Object> attributes;

    @Field(type = FieldType.Object, enabled = false)
    private List<SkuInfo> skus;

    @Field(type = FieldType.Double)
    private Double avgRating;

    @Field(type = FieldType.Integer)
    private Integer reviewCount;

    @Field(type = FieldType.Date, format = {DateFormat.date_optional_time, DateFormat.date})
    private LocalDateTime createdAt;

    @Field(type = FieldType.Date, format = {DateFormat.date_optional_time, DateFormat.date})
    private LocalDateTime updatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SkuInfo {
        private String id;
        private String skuCode;
        private String variantName;
        private Map<String, String> attributes;
        private BigDecimal price;
        private boolean active;
    }
}
