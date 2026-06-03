package com.ecommerce.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Wrapper that exposes Spring {@link Page} metadata in a serialization-friendly format.
 *
 * @param <T> the type of the page content
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PageResponse<T> {

    private List<T> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private boolean last;

    /**
     * Constructs a {@code PageResponse} from a Spring {@link Page}.
     *
     * @param springPage the Spring page to wrap
     * @param <T>        the content type
     * @return a populated {@code PageResponse}
     */
    public static <T> PageResponse<T> from(Page<T> springPage) {
        PageResponse<T> response = new PageResponse<>();
        response.setContent(springPage.getContent());
        response.setPage(springPage.getNumber());
        response.setSize(springPage.getSize());
        response.setTotalElements(springPage.getTotalElements());
        response.setTotalPages(springPage.getTotalPages());
        response.setLast(springPage.isLast());
        return response;
    }
}
