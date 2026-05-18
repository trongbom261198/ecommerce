package com.ecommerce.productservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CategoryRequest {

    private UUID parentId;

    @NotBlank(message = "Category name is required")
    @Size(max = 255)
    private String name;

    @Size(max = 255)
    private String slug;

    private String description;

    @Size(max = 1000)
    private String imageUrl;

    private int sortOrder;

    @Builder.Default
    private boolean active = true;
}
