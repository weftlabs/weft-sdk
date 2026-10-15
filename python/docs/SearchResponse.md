# SearchResponse

The weft-search-platform `POST /v1/search` response envelope.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**query_trace_id** | **UUID** | Opaque trace id for the served query, matching the platform &#x60;query_trace_id&#x60; — and the &#x60;search_id&#x60; that re-reads it. Deliberately the same id rather than a second handle: one serve, one name.  |
**query** | **str** |  |
**format** | **str** | Which view this response carries, echoing the requested format. &#x60;json&#x60; populates &#x60;results&#x60; and leaves &#x60;markdown&#x60; null; &#x60;markdown&#x60; populates &#x60;markdown&#x60; and leaves &#x60;results&#x60; empty. Exactly one is populated per response, never both — returning both eagerly would double the payload.  | [optional]
**markdown** | **str** | The flat comparison table, when &#x60;format&#x60; is &#x60;markdown&#x60;; null otherwise. Rendered deterministically from the same stored result the &#x60;json&#x60; view returns, so the two views of one search can never disagree.  | [optional]
**result_count** | **int** | How many &#x60;(Provider + Capability)&#x60; results the search produced. Read THIS, not &#x60;results.length&#x60;, for the count: on a &#x60;markdown&#x60; response &#x60;results&#x60; is empty by design, so &#x60;result_count &gt; 0&#x60; with an empty &#x60;results&#x60; is a rendered table while &#x60;result_count &#x3D;&#x3D; 0&#x60; is a genuine zero-result. On a &#x60;compact&#x60; view response it counts &#x60;compact_results&#x60;; there, &#x60;result_count &#x3D;&#x3D; 0&#x60; with &#x60;omitted_results&#x60; means every ranked result was too large to show.  | [optional]
**served_from** | **str** | &#x60;live&#x60; for a fresh serve; &#x60;snapshot&#x60; for an immutable replay of a completed search. A re-read is a snapshot and says so — read it with &#x60;as_of&#x60; and &#x60;stale&#x60;.  | [optional]
**as_of** | **datetime** | When the results were produced. Now on a &#x60;live&#x60; serve; on a &#x60;snapshot&#x60; the ORIGINAL serve time, because a replay returns exactly what was paid for, not current truth.  | [optional]
**stale** | **bool** | Whether the active search index has changed since these results were produced. &#x60;true&#x60; does not mean the results are wrong — it means they are a snapshot of an index that has since moved. Always &#x60;false&#x60; on a &#x60;live&#x60; serve.  | [optional]
**payment_note** | **str** | How payment works across the catalog, stated once for the whole response rather than repeated in every endpoint&#39;s usage instructions.  | [optional]
**applied_filters** | [**SearchFilterSpec**](SearchFilterSpec.md) | The &#x60;FilterSpec&#x60; actually applied to recall, echoed back so the caller sees exactly what constrained the results. In the current contract this is the caller&#39;s &#x60;filters&#x60; verbatim (empty object when none were sent).  | [optional]
**decomposition_source** | **str** | Origin of &#x60;applied_filters&#x60;; always &#x60;CALLER&#x60;. | [optional]
**embedder_model** | **str** |  |
**candidates_considered** | **int** |  |
**warnings** | [**List[SearchResponseWarningsInner]**](SearchResponseWarningsInner.md) |  |
**match_quality** | **str** | Calibrated confidence in this result set — read this instead of thresholding a raw similarity score. &#x60;strong&#x60;: the top match is confidently on-intent, proceed. &#x60;weak&#x60;: above the relevance floor but inside the band where plausible-but-wrong matches live, verify the result before paying. &#x60;none&#x60;: nothing cleared the floor — &#x60;results&#x60; is empty and &#x60;reason&#x60; / &#x60;suggestion&#x60; say why. Results below the floor are never returned as near-misses.  | [optional] [default to 'none']
**reason** | **str** | Machine-readable cause of an empty result set, non-null exactly when &#x60;match_quality&#x60; is &#x60;none&#x60;. &#x60;below_relevance_floor&#x60;: candidates ranked but the best scored under the floor. &#x60;filter_collapsed_pool&#x60;: a caller filter cut the pool before ranking and nothing relevant survived — relax the filter. &#x60;no_catalog_coverage&#x60;: recall returned no candidates at all on an unfiltered query. &#x60;unsupported_filter_value&#x60;: a CATEGORICAL filter value (&#x60;type&#x60; / &#x60;protocol&#x60;) matches zero stored values, so it could never have matched — categorical only, since a continuous bound like &#x60;price&#x60; that matches nothing is reported as &#x60;filter_collapsed_pool&#x60; instead (the bound needs raising, the dimension is not unsupported). &#x60;index_unavailable&#x60;: no active index — an operational fault, paired with the &#x60;EMPTY_INDEX&#x60; warning.  | [optional]
**suggestion** | **str** | Human/agent-readable explanation of &#x60;reason&#x60;, carrying the concrete numbers behind it (pool sizes, the best discarded score against the floor, the values actually stored for a filter). Non-null exactly when &#x60;reason&#x60; is.  | [optional]
**results** | [**List[SearchResult]**](SearchResult.md) | Ranked &#x60;(Provider + Capability)&#x60; results; empty when the index is empty or nothing cleared the relevance floor. Results BELOW the floor are never returned — an empty list plus a &#x60;reason&#x60; is the honest answer, not a list of near-misses in the same shape as a genuine match. Empty on a &#x60;compact&#x60; view response; read &#x60;compact_results&#x60;.  |
**view** | **str** | The view this response carries. Present as &#x60;compact&#x60; when the request asked for &#x60;view: \&quot;compact\&quot;&#x60;; absent means &#x60;full&#x60;.  | [optional]
**compact_results** | [**List[SearchCompactResult]**](SearchCompactResult.md) | Ranked compact results, present only on a &#x60;compact&#x60; view response. &#x60;result_count&#x60; is their count. They are a separate field so that typed clients keep the full &#x60;SearchResult&#x60; shape for &#x60;results&#x60;.  | [optional]
**omitted_results** | **int** | Compact view only: how many ranked results were left out because even their minimum summary does not fit the per-result budget. Absent when none were left out.  | [optional]

## Example

```python
from weft_sdk.generated.models.search_response import SearchResponse

# TODO update the JSON string below
json = "{}"
# create an instance of SearchResponse from a JSON string
search_response_instance = SearchResponse.from_json(json)
# print the JSON string representation of the object
print(SearchResponse.to_json())

# convert the object into a dict
search_response_dict = search_response_instance.to_dict()
# create an instance of SearchResponse from a dict
search_response_from_dict = SearchResponse.from_dict(search_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
