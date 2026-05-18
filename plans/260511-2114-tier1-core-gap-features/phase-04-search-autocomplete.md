# Phase 04 — Search Autocomplete

## Context Links
- Owning service: `BE/product-service` (Elasticsearch already deployed and synced)
- Existing: `ProductDocument` indexed with `name` (text), `brand` (keyword), `categoryName` (keyword)
- FE: extend existing `FE/src/components/layout/SearchBox.tsx`

## Overview
- **Priority:** P2
- **Status:** complete
- **Effort:** 4h
- Type-ahead suggestions as user types. Returns top 8 products matching prefix on name. Drop-down under search box with thumbnail, name, price; click navigates to PDP.

## Key Insights
- ES `ProductDocument.name` uses `standard` analyzer today → fine for full-text but not optimal for prefix. Two options:
  - **A) `match_phrase_prefix`** — works with existing index, slightly slower, no reindex needed.
  - **B) Completion suggester** — fast but needs a new `Completion` field → reindex required.
- **Choice: Option A** — KISS, ships fast, "good enough" for catalog under 100k products. Document path to migrate to B if latency degrades.
- Debounce on FE (250ms) to limit ES load.

## Requirements
**Functional:**
- GET `/api/v1/products/suggest?q=foo&limit=8` — public
- Returns lightweight payload: `{id, name, slug?, thumbnail, price}[]`
- Empty `q` or `q.length < 2` → 200 with `[]` (no ES call)

**Non-functional:**
- p95 latency < 200ms.
- Public endpoint; no auth.
- Result includes minimal fields only (no full product hydration).

## Architecture

```
FE SearchBox onChange
  │ debounce 250ms
  │ skip if q.length < 2
  ▼ GET /products/suggest?q=foo&limit=8
  │
  ▼ product-service ProductSuggestService
  │   ElasticsearchOperations.search(
  │     QueryBuilders.boolQuery()
  │       .should(matchPhrasePrefix("name", q).boost(3))
  │       .should(matchPhrasePrefix("brand", q).boost(2))
  │       .should(matchPhrasePrefix("categoryName", q).boost(1))
  │       .minimumShouldMatch(1)
  │       .filter(termQuery("status", "ACTIVE"))
  │     , size=limit, sort by _score desc
  │   )
  │
  ▼ map ProductDocument → SuggestionResponse (thin)
  │
  ▼ JSON to FE → render dropdown
```

## Files to Create

**BE (product-service):**
- `dto/SuggestionResponse.java` (record: id, name, thumbnail, price)
- `service/ProductSuggestService.java`

**FE:**
- `src/services/suggest-service.ts` (or extend existing productService.ts)
- `src/hooks/use-search-suggestions.ts` (debounced fetch, cache)
- `src/components/layout/SearchSuggestionDropdown.tsx`

## Files to Modify

**BE:**
- `BE/product-service/.../controller/ProductController.java` — add `GET /products/suggest` endpoint
- `BE/api-gateway` route — `/api/v1/products/**` already covers it

**FE:**
- `FE/src/components/layout/SearchBox.tsx` — wire input → hook → dropdown; handle click + arrow keys

## Implementation Steps

1. Create `SuggestionResponse` record.
2. Implement `ProductSuggestService.suggest(q, limit)`:
   - Short-circuit if `q == null || q.trim().length() < 2` → `List.of()`
   - Build bool query as above using `ElasticsearchOperations` (already configured)
   - Map hits → `SuggestionResponse`
3. Add endpoint `GET /products/suggest` to `ProductController` (public — no role check).
4. Smoke test: `curl 'http://localhost:8080/api/v1/products/suggest?q=iph&limit=8'`.
5. FE: `useSearchSuggestions(q)` hook with `useDebouncedValue(q, 250)` + Tanstack Query (`enabled: debouncedQ.length >= 2`).
6. `SearchSuggestionDropdown` — list of clickable rows + footer "Xem tất cả kết quả cho 'q'".
7. Wire into `SearchBox.tsx`:
   - Track focus state, open dropdown on focus + non-empty + has results
   - Close on Escape, outside-click, or click on item
   - Keyboard: ArrowDown/ArrowUp highlight, Enter selects or submits search
8. Mobile: same behavior, full-width dropdown below search bar.

## Todo List

- [x] SuggestionResponse DTO
- [x] ProductSuggestService
- [x] /products/suggest endpoint (public)
- [x] Smoke test ES query
- [x] FE service/hook with debounce + Tanstack Query
- [x] SearchSuggestionDropdown component
- [x] SearchBox integration: focus, keyboard nav, click handling
- [ ] Mobile menu integration
- [ ] Manual E2E: type 2 chars → see 8 results in <200ms

## Success Criteria

- Typing "iph" shows iPhone-related products within 250ms after stop typing.
- Click on suggestion navigates to `/products/{id}`.
- Pressing Enter on highlighted item navigates; pressing Enter with no highlight submits full search.
- Escape closes dropdown.
- Empty/short query → no ES call, no dropdown.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ES match_phrase_prefix too slow at scale | L | M | Migrate to completion suggester (add `Completion` field, run resync) |
| User types fast, races trigger N requests | M | L | Debounce 250ms + Tanstack Query dedupes in-flight by key |
| Returns inactive/deleted products | M | M | Filter on `status == ACTIVE` in query |
| No results UX dead-end | L | L | Show "Không tìm thấy" in dropdown with link to full search |
| Open dropdown blocks page interaction | L | L | Outside-click handler + Escape close |

## Security Considerations
- Public endpoint — no auth.
- Query length capped at 100 chars (DTO validation) to prevent ES query bombs.
- Response size capped at 20 (`limit` clamp).

## Backwards Compatibility
- New endpoint — additive.
- SearchBox keeps existing behavior (Enter submits to `/products?q=`) — dropdown is purely additive.

## Rollback Plan
- BE: remove endpoint (no DB changes).
- FE: `FEATURES.searchAutocomplete = false` → SearchBox returns to plain input.

## Next Steps / Dependencies
- Tier 2: completion suggester, "trending searches", popular categories, query history per user.
