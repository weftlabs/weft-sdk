# SearchCompactAccessPrice

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Kind** | Pointer to **string** | Price kind, such as &#x60;fixed&#x60;, &#x60;dynamic&#x60;, &#x60;free&#x60; or &#x60;unknown&#x60;. | [optional]
**IndexedUsd** | Pointer to **string** | Indexed USD price. A &#x60;dynamic&#x60; price is not a cap. | [optional]
**Unit** | Pointer to **string** |  | [optional]
**Hint** | Pointer to **string** |  | [optional]

## Methods

### NewSearchCompactAccessPrice

`func NewSearchCompactAccessPrice() *SearchCompactAccessPrice`

NewSearchCompactAccessPrice instantiates a new SearchCompactAccessPrice object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchCompactAccessPriceWithDefaults

`func NewSearchCompactAccessPriceWithDefaults() *SearchCompactAccessPrice`

NewSearchCompactAccessPriceWithDefaults instantiates a new SearchCompactAccessPrice object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetKind

`func (o *SearchCompactAccessPrice) GetKind() string`

GetKind returns the Kind field if non-nil, zero value otherwise.

### GetKindOk

`func (o *SearchCompactAccessPrice) GetKindOk() (*string, bool)`

GetKindOk returns a tuple with the Kind field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetKind

`func (o *SearchCompactAccessPrice) SetKind(v string)`

SetKind sets Kind field to given value.

### HasKind

`func (o *SearchCompactAccessPrice) HasKind() bool`

HasKind returns a boolean if a field has been set.

### GetIndexedUsd

`func (o *SearchCompactAccessPrice) GetIndexedUsd() string`

GetIndexedUsd returns the IndexedUsd field if non-nil, zero value otherwise.

### GetIndexedUsdOk

`func (o *SearchCompactAccessPrice) GetIndexedUsdOk() (*string, bool)`

GetIndexedUsdOk returns a tuple with the IndexedUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndexedUsd

`func (o *SearchCompactAccessPrice) SetIndexedUsd(v string)`

SetIndexedUsd sets IndexedUsd field to given value.

### HasIndexedUsd

`func (o *SearchCompactAccessPrice) HasIndexedUsd() bool`

HasIndexedUsd returns a boolean if a field has been set.

### GetUnit

`func (o *SearchCompactAccessPrice) GetUnit() string`

GetUnit returns the Unit field if non-nil, zero value otherwise.

### GetUnitOk

`func (o *SearchCompactAccessPrice) GetUnitOk() (*string, bool)`

GetUnitOk returns a tuple with the Unit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUnit

`func (o *SearchCompactAccessPrice) SetUnit(v string)`

SetUnit sets Unit field to given value.

### HasUnit

`func (o *SearchCompactAccessPrice) HasUnit() bool`

HasUnit returns a boolean if a field has been set.

### GetHint

`func (o *SearchCompactAccessPrice) GetHint() string`

GetHint returns the Hint field if non-nil, zero value otherwise.

### GetHintOk

`func (o *SearchCompactAccessPrice) GetHintOk() (*string, bool)`

GetHintOk returns a tuple with the Hint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHint

`func (o *SearchCompactAccessPrice) SetHint(v string)`

SetHint sets Hint field to given value.

### HasHint

`func (o *SearchCompactAccessPrice) HasHint() bool`

HasHint returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
