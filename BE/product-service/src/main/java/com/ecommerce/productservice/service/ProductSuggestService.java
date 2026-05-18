package com.ecommerce.productservice.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.ecommerce.productservice.document.ProductDocument;
import com.ecommerce.productservice.dto.SuggestionResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductSuggestService {

    private final ElasticsearchClient elasticsearchClient;

    public List<SuggestionResponse> suggest(String q, int limit) {
        if (q == null || q.trim().length() < 2) {
            return List.of();
        }
        int clampedLimit = Math.min(limit, 20);
        String trimmed = q.trim();

        try {
            BoolQuery boolQuery = BoolQuery.of(b -> b
                    .should(Query.of(qb -> qb.matchPhrasePrefix(mpp -> mpp
                            .field("name")
                            .query(trimmed)
                            .boost(3f)
                    )))
                    .should(Query.of(qb -> qb.matchPhrasePrefix(mpp -> mpp
                            .field("brand")
                            .query(trimmed)
                            .boost(2f)
                    )))
                    .minimumShouldMatch("1")
                    .filter(Query.of(qb -> qb.term(t -> t
                            .field("status")
                            .value("ACTIVE")
                    )))
            );

            SearchRequest request = SearchRequest.of(s -> s
                    .index("products")
                    .query(Query.of(q2 -> q2.bool(boolQuery)))
                    .size(clampedLimit)
                    .sort(so -> so.score(sc -> sc.order(SortOrder.Desc)))
            );

            SearchResponse<ProductDocument> response =
                    elasticsearchClient.search(request, ProductDocument.class);

            return response.hits().hits().stream()
                    .map(Hit::source)
                    .filter(doc -> doc != null)
                    .map(this::toSuggestionResponse)
                    .toList();

        } catch (Exception e) {
            log.error("Suggest query failed for q='{}': {}", q, e.getMessage(), e);
            return List.of();
        }
    }

    private SuggestionResponse toSuggestionResponse(ProductDocument doc) {
        String thumbnail = (doc.getImages() != null && !doc.getImages().isEmpty())
                ? doc.getImages().get(0)
                : null;

        BigDecimal price = doc.getMinSkuPrice() != null
                ? doc.getMinSkuPrice()
                : doc.getBasePrice();

        return new SuggestionResponse(doc.getId(), doc.getName(), thumbnail, price);
    }
}
