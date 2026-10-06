# SearchWeftFetchCompatibility

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**State** | **string** |  |
**Reason** | **string** |  |
**ContractVersion** | **int32** |  |
**Coverage** | Pointer to **string** | Extent of the operation covered by weft_fetch. &#x60;terminal_response&#x60; covers the terminal result; &#x60;submission_only&#x60; covers submission but not completion or retrieval of the result; &#x60;none&#x60; means no coverage. When absent, coverage is unknown, not terminal. Do not infer terminal coverage from synchronous execution mode alone.  | [optional]

## Methods

### NewSearchWeftFetchCompatibility

`func NewSearchWeftFetchCompatibility(state string, reason string, contractVersion int32, ) *SearchWeftFetchCompatibility`

NewSearchWeftFetchCompatibility instantiates a new SearchWeftFetchCompatibility object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchWeftFetchCompatibilityWithDefaults

`func NewSearchWeftFetchCompatibilityWithDefaults() *SearchWeftFetchCompatibility`

NewSearchWeftFetchCompatibilityWithDefaults instantiates a new SearchWeftFetchCompatibility object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetState

`func (o *SearchWeftFetchCompatibility) GetState() string`

GetState returns the State field if non-nil, zero value otherwise.

### GetStateOk

`func (o *SearchWeftFetchCompatibility) GetStateOk() (*string, bool)`

GetStateOk returns a tuple with the State field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetState

`func (o *SearchWeftFetchCompatibility) SetState(v string)`

SetState sets State field to given value.


### GetReason

`func (o *SearchWeftFetchCompatibility) GetReason() string`

GetReason returns the Reason field if non-nil, zero value otherwise.

### GetReasonOk

`func (o *SearchWeftFetchCompatibility) GetReasonOk() (*string, bool)`

GetReasonOk returns a tuple with the Reason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReason

`func (o *SearchWeftFetchCompatibility) SetReason(v string)`

SetReason sets Reason field to given value.


### GetContractVersion

`func (o *SearchWeftFetchCompatibility) GetContractVersion() int32`

GetContractVersion returns the ContractVersion field if non-nil, zero value otherwise.

### GetContractVersionOk

`func (o *SearchWeftFetchCompatibility) GetContractVersionOk() (*int32, bool)`

GetContractVersionOk returns a tuple with the ContractVersion field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContractVersion

`func (o *SearchWeftFetchCompatibility) SetContractVersion(v int32)`

SetContractVersion sets ContractVersion field to given value.


### GetCoverage

`func (o *SearchWeftFetchCompatibility) GetCoverage() string`

GetCoverage returns the Coverage field if non-nil, zero value otherwise.

### GetCoverageOk

`func (o *SearchWeftFetchCompatibility) GetCoverageOk() (*string, bool)`

GetCoverageOk returns a tuple with the Coverage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCoverage

`func (o *SearchWeftFetchCompatibility) SetCoverage(v string)`

SetCoverage sets Coverage field to given value.

### HasCoverage

`func (o *SearchWeftFetchCompatibility) HasCoverage() bool`

HasCoverage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
