package com.ecommerce.productservice.mapper;

import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.ProductResponse;
import com.ecommerce.productservice.dto.SkuResponse;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.Sku;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface ProductMapper {

    @Mapping(target = "parentId", source = "parent.id")
    @Mapping(target = "children", ignore = true)
    CategoryDto toCategoryDto(Category category);

    @Mapping(target = "categoryId", source = "category.id")
    @Mapping(target = "categoryName", source = "category.name")
    @Mapping(target = "skus", ignore = true)
    @Mapping(target = "avgRating", expression = "java(product.getAvgRating() != null ? product.getAvgRating().doubleValue() : 0.0)")
    @Mapping(target = "reviewCount", source = "reviewCount")
    ProductResponse toProductResponse(Product product);

    SkuResponse toSkuResponse(Sku sku);

    List<SkuResponse> toSkuResponseList(List<Sku> skus);
}
