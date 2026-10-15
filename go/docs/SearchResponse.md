# SearchResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**QueryTraceId** | **string** | Opaque trace id for the served query, matching the platform &#x60;query_trace_id&#x60; — and the &#x60;search_id&#x60; that re-reads it. Deliberately the same id rather than a second handle: one serve, one name.  |
**Query** | **string** |  |
**Format** | Pointer to **string** | Which view this response carries, echoing the requested format. &#x60;json&#x60; populates &#x60;results&#x60; and leaves &#x60;markdown&#x60; null; &#x60;markdown&#x60; populates &#x60;markdown&#x60; and leaves &#x60;results&#x60; empty. Exactly one is populated per response, never both — returning both eagerly would double the payload.  | [optional]
**Markdown** | Pointer to **string** | The flat comparison table, when &#x60;format&#x60; is &#x60;markdown&#x60;; null otherwise. Rendered deterministically from the same stored result the &#x60;json&#x60; view returns, so the two views of one search can never disagree.  | [optional]
**ResultCount** | Pointer to **int32** | How many &#x60;(Provider + Capability)&#x60; results the search produced. Read THIS, not &#x60;results.length&#x60;, for the count: on a &#x60;markdown&#x60; response &#x60;results&#x60; is empty by design, so &#x60;result_count &gt; 0&#x60; with an empty &#x60;results&#x60; is a rendered table while &#x60;result_count &#x3D;&#x3D; 0&#x60; is a genuine zero-result. On a &#x60;compact&#x60; view response it counts &#x60;compact_results&#x60;; there, &#x60;result_count &#x3D;&#x3D; 0&#x60; with &#x60;omitted_results&#x60; means every ranked result was too large to show.  | [optional]
**ServedFrom** | Pointer to **string** | &#x60;live&#x60; for a fresh serve; &#x60;snapshot&#x60; for an immutable replay of a completed search. A re-read is a snapshot and says so — read it with &#x60;as_of&#x60; and &#x60;stale&#x60;.  | [optional]
**AsOf** | Pointer to **time.Time** | When the results were produced. Now on a &#x60;live&#x60; serve; on a &#x60;snapshot&#x60; the ORIGINAL serve time, because a replay returns exactly what was paid for, not current truth.  | [optional]
**Stale** | Pointer to **bool** | Whether the active search index has changed since these results were produced. &#x60;true&#x60; does not mean the results are wrong — it means they are a snapshot of an index that has since moved. Always &#x60;false&#x60; on a &#x60;live&#x60; serve.  | [optional]
**PaymentNote** | Pointer to **string** | How payment works across the catalog, stated once for the whole response rather than repeated in every endpoint&#39;s usage instructions.  | [optional]
**AppliedFilters** | Pointer to [**SearchFilterSpec**](SearchFilterSpec.md) | The &#x60;FilterSpec&#x60; actually applied to recall, echoed back so the caller sees exactly what constrained the results. In the current contract this is the caller&#39;s &#x60;filters&#x60; verbatim (empty object when none were sent).  | [optional]
**DecompositionSource** | Pointer to **string** | Origin of &#x60;applied_filters&#x60;; always &#x60;CALLER&#x60;. | [optional]
**EmbedderModel** | **string** |  |
**CandidatesConsidered** | **int32** |  |
**Warnings** | [**[]SearchResponseWarningsInner**](SearchResponseWarningsInner.md) |  |
**MatchQuality** | Pointer to **string** | Calibrated confidence in this result set — read this instead of thresholding a raw similarity score. &#x60;strong&#x60;: the top match is confidently on-intent, proceed. &#x60;weak&#x60;: above the relevance floor but inside the band where plausible-but-wrong matches live, verify the result before paying. &#x60;none&#x60;: nothing cleared the floor — &#x60;results&#x60; is empty and &#x60;reason&#x60; / &#x60;suggestion&#x60; say why. Results below the floor are never returned as near-misses.  | [optional] [default to "none"]
**Reason** | Pointer to **string** | Machine-readable cause of an empty result set, non-null exactly when &#x60;match_quality&#x60; is &#x60;none&#x60;. &#x60;below_relevance_floor&#x60;: candidates ranked but the best scored under the floor. &#x60;filter_collapsed_pool&#x60;: a caller filter cut the pool before ranking and nothing relevant survived — relax the filter. &#x60;no_catalog_coverage&#x60;: recall returned no candidates at all on an unfiltered query. &#x60;unsupported_filter_value&#x60;: a CATEGORICAL filter value (&#x60;type&#x60; / &#x60;protocol&#x60;) matches zero stored values, so it could never have matched — categorical only, since a continuous bound like &#x60;price&#x60; that matches nothing is reported as &#x60;filter_collapsed_pool&#x60; instead (the bound needs raising, the dimension is not unsupported). &#x60;index_unavailable&#x60;: no active index — an operational fault, paired with the &#x60;EMPTY_INDEX&#x60; warning.  | [optional]
**Suggestion** | Pointer to **string** | Human/agent-readable explanation of &#x60;reason&#x60;, carrying the concrete numbers behind it (pool sizes, the best discarded score against the floor, the values actually stored for a filter). Non-null exactly when &#x60;reason&#x60; is.  | [optional]
**Results** | [**[]SearchResult**](SearchResult.md) | Ranked &#x60;(Provider + Capability)&#x60; results; empty when the index is empty or nothing cleared the relevance floor. Results BELOW the floor are never returned — an empty list plus a &#x60;reason&#x60; is the honest answer, not a list of near-misses in the same shape as a genuine match. Empty on a &#x60;compact&#x60; view response; read &#x60;compact_results&#x60;.  |
**View** | Pointer to **string** | The view this response carries. Present as &#x60;compact&#x60; when the request asked for &#x60;view: \&quot;compact\&quot;&#x60;; absent means &#x60;full&#x60;.  | [optional]
**CompactResults** | Pointer to [**[]SearchCompactResult**](SearchCompactResult.md) | Ranked compact results, present only on a &#x60;compact&#x60; view response. &#x60;result_count&#x60; is their count. They are a separate field so that typed clients keep the full &#x60;SearchResult&#x60; shape for &#x60;results&#x60;.  | [optional]
**OmittedResults** | Pointer to **int32** | Compact view only: how many ranked results were left out because even their minimum summary does not fit the per-result budget. Absent when none were left out.  | [optional]

## Methods

### NewSearchResponse

`func NewSearchResponse(queryTraceId string, query string, embedderModel string, candidatesConsidered int32, warnings []SearchResponseWarningsInner, results []SearchResult, ) *SearchResponse`

NewSearchResponse instantiates a new SearchResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchResponseWithDefaults

`func NewSearchResponseWithDefaults() *SearchResponse`

NewSearchResponseWithDefaults instantiates a new SearchResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetQueryTraceId

`func (o *SearchResponse) GetQueryTraceId() string`

GetQueryTraceId returns the QueryTraceId field if non-nil, zero value otherwise.

### GetQueryTraceIdOk

`func (o *SearchResponse) GetQueryTraceIdOk() (*string, bool)`

GetQueryTraceIdOk returns a tuple with the QueryTraceId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetQueryTraceId

`func (o *SearchResponse) SetQueryTraceId(v string)`

SetQueryTraceId sets QueryTraceId field to given value.


### GetQuery

`func (o *SearchResponse) GetQuery() string`

GetQuery returns the Query field if non-nil, zero value otherwise.

### GetQueryOk

`func (o *SearchResponse) GetQueryOk() (*string, bool)`

GetQueryOk returns a tuple with the Query field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetQuery

`func (o *SearchResponse) SetQuery(v string)`

SetQuery sets Query field to given value.


### GetFormat

`func (o *SearchResponse) GetFormat() string`

GetFormat returns the Format field if non-nil, zero value otherwise.

### GetFormatOk

`func (o *SearchResponse) GetFormatOk() (*string, bool)`

GetFormatOk returns a tuple with the Format field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFormat

`func (o *SearchResponse) SetFormat(v string)`

SetFormat sets Format field to given value.

### HasFormat

`func (o *SearchResponse) HasFormat() bool`

HasFormat returns a boolean if a field has been set.

### GetMarkdown

`func (o *SearchResponse) GetMarkdown() string`

GetMarkdown returns the Markdown field if non-nil, zero value otherwise.

### GetMarkdownOk

`func (o *SearchResponse) GetMarkdownOk() (*string, bool)`

GetMarkdownOk returns a tuple with the Markdown field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMarkdown

`func (o *SearchResponse) SetMarkdown(v string)`

SetMarkdown sets Markdown field to given value.

### HasMarkdown

`func (o *SearchResponse) HasMarkdown() bool`

HasMarkdown returns a boolean if a field has been set.

### GetResultCount

`func (o *SearchResponse) GetResultCount() int32`

GetResultCount returns the ResultCount field if non-nil, zero value otherwise.

### GetResultCountOk

`func (o *SearchResponse) GetResultCountOk() (*int32, bool)`

GetResultCountOk returns a tuple with the ResultCount field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResultCount

`func (o *SearchResponse) SetResultCount(v int32)`

SetResultCount sets ResultCount field to given value.

### HasResultCount

`func (o *SearchResponse) HasResultCount() bool`

HasResultCount returns a boolean if a field has been set.

### GetServedFrom

`func (o *SearchResponse) GetServedFrom() string`

GetServedFrom returns the ServedFrom field if non-nil, zero value otherwise.

### GetServedFromOk

`func (o *SearchResponse) GetServedFromOk() (*string, bool)`

GetServedFromOk returns a tuple with the ServedFrom field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServedFrom

`func (o *SearchResponse) SetServedFrom(v string)`

SetServedFrom sets ServedFrom field to given value.

### HasServedFrom

`func (o *SearchResponse) HasServedFrom() bool`

HasServedFrom returns a boolean if a field has been set.

### GetAsOf

`func (o *SearchResponse) GetAsOf() time.Time`

GetAsOf returns the AsOf field if non-nil, zero value otherwise.

### GetAsOfOk

`func (o *SearchResponse) GetAsOfOk() (*time.Time, bool)`

GetAsOfOk returns a tuple with the AsOf field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAsOf

`func (o *SearchResponse) SetAsOf(v time.Time)`

SetAsOf sets AsOf field to given value.

### HasAsOf

`func (o *SearchResponse) HasAsOf() bool`

HasAsOf returns a boolean if a field has been set.

### GetStale

`func (o *SearchResponse) GetStale() bool`

GetStale returns the Stale field if non-nil, zero value otherwise.

### GetStaleOk

`func (o *SearchResponse) GetStaleOk() (*bool, bool)`

GetStaleOk returns a tuple with the Stale field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStale

`func (o *SearchResponse) SetStale(v bool)`

SetStale sets Stale field to given value.

### HasStale

`func (o *SearchResponse) HasStale() bool`

HasStale returns a boolean if a field has been set.

### GetPaymentNote

`func (o *SearchResponse) GetPaymentNote() string`

GetPaymentNote returns the PaymentNote field if non-nil, zero value otherwise.

### GetPaymentNoteOk

`func (o *SearchResponse) GetPaymentNoteOk() (*string, bool)`

GetPaymentNoteOk returns a tuple with the PaymentNote field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPaymentNote

`func (o *SearchResponse) SetPaymentNote(v string)`

SetPaymentNote sets PaymentNote field to given value.

### HasPaymentNote

`func (o *SearchResponse) HasPaymentNote() bool`

HasPaymentNote returns a boolean if a field has been set.

### GetAppliedFilters

`func (o *SearchResponse) GetAppliedFilters() SearchFilterSpec`

GetAppliedFilters returns the AppliedFilters field if non-nil, zero value otherwise.

### GetAppliedFiltersOk

`func (o *SearchResponse) GetAppliedFiltersOk() (*SearchFilterSpec, bool)`

GetAppliedFiltersOk returns a tuple with the AppliedFilters field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAppliedFilters

`func (o *SearchResponse) SetAppliedFilters(v SearchFilterSpec)`

SetAppliedFilters sets AppliedFilters field to given value.

### HasAppliedFilters

`func (o *SearchResponse) HasAppliedFilters() bool`

HasAppliedFilters returns a boolean if a field has been set.

### GetDecompositionSource

`func (o *SearchResponse) GetDecompositionSource() string`

GetDecompositionSource returns the DecompositionSource field if non-nil, zero value otherwise.

### GetDecompositionSourceOk

`func (o *SearchResponse) GetDecompositionSourceOk() (*string, bool)`

GetDecompositionSourceOk returns a tuple with the DecompositionSource field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDecompositionSource

`func (o *SearchResponse) SetDecompositionSource(v string)`

SetDecompositionSource sets DecompositionSource field to given value.

### HasDecompositionSource

`func (o *SearchResponse) HasDecompositionSource() bool`

HasDecompositionSource returns a boolean if a field has been set.

### GetEmbedderModel

`func (o *SearchResponse) GetEmbedderModel() string`

GetEmbedderModel returns the EmbedderModel field if non-nil, zero value otherwise.

### GetEmbedderModelOk

`func (o *SearchResponse) GetEmbedderModelOk() (*string, bool)`

GetEmbedderModelOk returns a tuple with the EmbedderModel field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEmbedderModel

`func (o *SearchResponse) SetEmbedderModel(v string)`

SetEmbedderModel sets EmbedderModel field to given value.


### GetCandidatesConsidered

`func (o *SearchResponse) GetCandidatesConsidered() int32`

GetCandidatesConsidered returns the CandidatesConsidered field if non-nil, zero value otherwise.

### GetCandidatesConsideredOk

`func (o *SearchResponse) GetCandidatesConsideredOk() (*int32, bool)`

GetCandidatesConsideredOk returns a tuple with the CandidatesConsidered field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCandidatesConsidered

`func (o *SearchResponse) SetCandidatesConsidered(v int32)`

SetCandidatesConsidered sets CandidatesConsidered field to given value.


### GetWarnings

`func (o *SearchResponse) GetWarnings() []SearchResponseWarningsInner`

GetWarnings returns the Warnings field if non-nil, zero value otherwise.

### GetWarningsOk

`func (o *SearchResponse) GetWarningsOk() (*[]SearchResponseWarningsInner, bool)`

GetWarningsOk returns a tuple with the Warnings field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWarnings

`func (o *SearchResponse) SetWarnings(v []SearchResponseWarningsInner)`

SetWarnings sets Warnings field to given value.


### GetMatchQuality

`func (o *SearchResponse) GetMatchQuality() string`

GetMatchQuality returns the MatchQuality field if non-nil, zero value otherwise.

### GetMatchQualityOk

`func (o *SearchResponse) GetMatchQualityOk() (*string, bool)`

GetMatchQualityOk returns a tuple with the MatchQuality field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMatchQuality

`func (o *SearchResponse) SetMatchQuality(v string)`

SetMatchQuality sets MatchQuality field to given value.

### HasMatchQuality

`func (o *SearchResponse) HasMatchQuality() bool`

HasMatchQuality returns a boolean if a field has been set.

### GetReason

`func (o *SearchResponse) GetReason() string`

GetReason returns the Reason field if non-nil, zero value otherwise.

### GetReasonOk

`func (o *SearchResponse) GetReasonOk() (*string, bool)`

GetReasonOk returns a tuple with the Reason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReason

`func (o *SearchResponse) SetReason(v string)`

SetReason sets Reason field to given value.

### HasReason

`func (o *SearchResponse) HasReason() bool`

HasReason returns a boolean if a field has been set.

### GetSuggestion

`func (o *SearchResponse) GetSuggestion() string`

GetSuggestion returns the Suggestion field if non-nil, zero value otherwise.

### GetSuggestionOk

`func (o *SearchResponse) GetSuggestionOk() (*string, bool)`

GetSuggestionOk returns a tuple with the Suggestion field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSuggestion

`func (o *SearchResponse) SetSuggestion(v string)`

SetSuggestion sets Suggestion field to given value.

### HasSuggestion

`func (o *SearchResponse) HasSuggestion() bool`

HasSuggestion returns a boolean if a field has been set.

### GetResults

`func (o *SearchResponse) GetResults() []SearchResult`

GetResults returns the Results field if non-nil, zero value otherwise.

### GetResultsOk

`func (o *SearchResponse) GetResultsOk() (*[]SearchResult, bool)`

GetResultsOk returns a tuple with the Results field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResults

`func (o *SearchResponse) SetResults(v []SearchResult)`

SetResults sets Results field to given value.


### GetView

`func (o *SearchResponse) GetView() string`

GetView returns the View field if non-nil, zero value otherwise.

### GetViewOk

`func (o *SearchResponse) GetViewOk() (*string, bool)`

GetViewOk returns a tuple with the View field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetView

`func (o *SearchResponse) SetView(v string)`

SetView sets View field to given value.

### HasView

`func (o *SearchResponse) HasView() bool`

HasView returns a boolean if a field has been set.

### GetCompactResults

`func (o *SearchResponse) GetCompactResults() []SearchCompactResult`

GetCompactResults returns the CompactResults field if non-nil, zero value otherwise.

### GetCompactResultsOk

`func (o *SearchResponse) GetCompactResultsOk() (*[]SearchCompactResult, bool)`

GetCompactResultsOk returns a tuple with the CompactResults field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompactResults

`func (o *SearchResponse) SetCompactResults(v []SearchCompactResult)`

SetCompactResults sets CompactResults field to given value.

### HasCompactResults

`func (o *SearchResponse) HasCompactResults() bool`

HasCompactResults returns a boolean if a field has been set.

### GetOmittedResults

`func (o *SearchResponse) GetOmittedResults() int32`

GetOmittedResults returns the OmittedResults field if non-nil, zero value otherwise.

### GetOmittedResultsOk

`func (o *SearchResponse) GetOmittedResultsOk() (*int32, bool)`

GetOmittedResultsOk returns a tuple with the OmittedResults field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOmittedResults

`func (o *SearchResponse) SetOmittedResults(v int32)`

SetOmittedResults sets OmittedResults field to given value.

### HasOmittedResults

`func (o *SearchResponse) HasOmittedResults() bool`

HasOmittedResults returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
