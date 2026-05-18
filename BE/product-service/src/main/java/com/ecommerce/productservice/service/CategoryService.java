package com.ecommerce.productservice.service;

import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.ConflictException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.CategoryRequest;
import com.ecommerce.productservice.dto.ProductResponse;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.mapper.ProductMapper;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductMapper productMapper;

    @Transactional(readOnly = true)
    public List<CategoryDto> getAllCategories() {
        List<Category> roots = categoryRepository.findByParentIsNull();
        return roots.stream()
                .map(this::toCategoryDtoWithChildren)
                .toList();
    }

    @Transactional(readOnly = true)
    public CategoryDto getCategoryById(UUID id) {
        Category category = findCategoryById(id);
        return toCategoryDtoWithChildren(category);
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductResponse> getCategoryProducts(UUID id, Pageable pageable) {
        findCategoryById(id); // validate exists
        return PageResponse.from(
                productRepository.findByCategoryId(id, pageable)
                        .map(product -> {
                            ProductResponse response = productMapper.toProductResponse(product);
                            response.setSkus(productMapper.toSkuResponseList(product.getSkus()));
                            return response;
                        })
        );
    }

    @Transactional
    public CategoryDto createCategory(CategoryRequest request) {
        String slug = resolveSlug(request.getSlug(), request.getName());
        if (categoryRepository.existsBySlug(slug)) {
            throw new ConflictException("CATEGORY_SLUG_EXISTS", "Category with slug '" + slug + "' already exists");
        }

        Category parent = null;
        if (request.getParentId() != null) {
            parent = findCategoryById(request.getParentId());
        }

        Category category = Category.builder()
                .parent(parent)
                .name(request.getName())
                .slug(slug)
                .description(request.getDescription())
                .imageUrl(request.getImageUrl())
                .sortOrder(request.getSortOrder())
                .active(request.isActive())
                .build();

        Category saved = categoryRepository.save(category);
        return toCategoryDtoWithChildren(saved);
    }

    @Transactional
    public CategoryDto updateCategory(UUID id, CategoryRequest request) {
        Category category = findCategoryById(id);

        String slug = resolveSlug(request.getSlug(), request.getName());
        if (!slug.equals(category.getSlug()) && categoryRepository.existsBySlug(slug)) {
            throw new ConflictException("CATEGORY_SLUG_EXISTS", "Category with slug '" + slug + "' already exists");
        }

        if (request.getParentId() != null) {
            if (request.getParentId().equals(id)) {
                throw new ConflictException("CATEGORY_SELF_PARENT", "Category cannot be its own parent");
            }
            Category parent = findCategoryById(request.getParentId());
            category.setParent(parent);
        } else {
            category.setParent(null);
        }

        category.setName(request.getName());
        category.setSlug(slug);
        category.setDescription(request.getDescription());
        category.setImageUrl(request.getImageUrl());
        category.setSortOrder(request.getSortOrder());
        category.setActive(request.isActive());

        Category saved = categoryRepository.save(category);
        return toCategoryDtoWithChildren(saved);
    }

    public void deleteCategory(UUID id) {
        Category category = findCategoryById(id);
        if (!category.getChildren().isEmpty()) {
            throw new com.ecommerce.common.exception.BusinessException(
                    409, "CATEGORY_HAS_CHILDREN", "Cannot delete category with sub-categories");
        }
        categoryRepository.deleteById(id);
    }

    private Category findCategoryById(UUID id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("CATEGORY_NOT_FOUND", "Category not found with id: " + id));
    }

    private CategoryDto toCategoryDtoWithChildren(Category category) {
        CategoryDto dto = productMapper.toCategoryDto(category);
        List<CategoryDto> children = new ArrayList<>();
        for (Category child : category.getChildren()) {
            children.add(toCategoryDtoWithChildren(child));
        }
        dto.setChildren(children);
        return dto;
    }

    private String resolveSlug(String requestedSlug, String name) {
        if (requestedSlug != null && !requestedSlug.isBlank()) {
            return requestedSlug.toLowerCase().trim();
        }
        return generateSlug(name);
    }

    private String generateSlug(String name) {
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        return pattern.matcher(normalized)
                .replaceAll("")
                .toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("[\\s-]+", "-")
                .replaceAll("^-|-$", "");
    }
}
