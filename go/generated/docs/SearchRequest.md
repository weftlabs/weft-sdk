# SearchRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Query** | **string** | Free-text query. Required and non-empty. |
**MaxResults** | Pointer to **int32** | Max number of hits to return. Invalid values are rejected, not clamped. | [optional] [default to 10]
**Filters** | Pointer to [**SearchFilterSpec**](SearchFilterSpec.md) |  | [optional]
**View** | Pointer to **string** | Response view. Absent means &#x60;full&#x60;: the complete &#x60;SearchResult&#x60; rows in &#x60;results&#x60;. &#x60;compact&#x60; returns the hosted MCP agent view in &#x60;compact_results&#x60; (see &#x60;SearchCompactResult&#x60;). The compact view applies the same selection as hosted MCP search: it leaves out incomplete PayWithLocus gateway contracts. It does not add filters; send &#x60;weft_fetch_compatible: true&#x60; to get only results that &#x60;POST /api/v1/fetch&#x60; can pay.  | [optional]

## Methods

### NewSearchRequest

`func NewSearchRequest(query string, ) *SearchRequest`

NewSearchRequest instantiates a new SearchRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchRequestWithDefaults

`func NewSearchRequestWithDefaults() *SearchRequest`

NewSearchRequestWithDefaults instantiates a new SearchRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetQuery

`func (o *SearchRequest) GetQuery() string`

GetQuery returns the Query field if non-nil, zero value otherwise.

### GetQueryOk

`func (o *SearchRequest) GetQueryOk() (*string, bool)`

GetQueryOk returns a tuple with the Query field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetQuery

`func (o *SearchRequest) SetQuery(v string)`

SetQuery sets Query field to given value.


### GetMaxResults

`func (o *SearchRequest) GetMaxResults() int32`

GetMaxResults returns the MaxResults field if non-nil, zero value otherwise.

### GetMaxResultsOk

`func (o *SearchRequest) GetMaxResultsOk() (*int32, bool)`

GetMaxResultsOk returns a tuple with the MaxResults field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxResults

`func (o *SearchRequest) SetMaxResults(v int32)`

SetMaxResults sets MaxResults field to given value.

### HasMaxResults

`func (o *SearchRequest) HasMaxResults() bool`

HasMaxResults returns a boolean if a field has been set.

### GetFilters

`func (o *SearchRequest) GetFilters() SearchFilterSpec`

GetFilters returns the Filters field if non-nil, zero value otherwise.

### GetFiltersOk

`func (o *SearchRequest) GetFiltersOk() (*SearchFilterSpec, bool)`

GetFiltersOk returns a tuple with the Filters field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFilters

`func (o *SearchRequest) SetFilters(v SearchFilterSpec)`

SetFilters sets Filters field to given value.

### HasFilters

`func (o *SearchRequest) HasFilters() bool`

HasFilters returns a boolean if a field has been set.

### GetView

`func (o *SearchRequest) GetView() string`

GetView returns the View field if non-nil, zero value otherwise.

### GetViewOk

`func (o *SearchRequest) GetViewOk() (*string, bool)`

GetViewOk returns a tuple with the View field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetView

`func (o *SearchRequest) SetView(v string)`

SetView sets View field to given value.

### HasView

`func (o *SearchRequest) HasView() bool`

HasView returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
