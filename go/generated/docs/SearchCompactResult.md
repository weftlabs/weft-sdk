# SearchCompactResult

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Provider** | Pointer to [**SearchCompactResultProvider**](SearchCompactResultProvider.md) |  | [optional]
**Operation** | [**SearchCompactResultOperation**](SearchCompactResultOperation.md) |  |
**Inputs** | Pointer to **map[string]interface{}** | Typed business inputs (a bounded JSON schema), or the names and locations of the required inputs when the full schema does not fit. Read the full contract before you send an input not listed.  | [optional]
**Request** | Pointer to **map[string]interface{}** | The request recipe: &#x60;method&#x60;, canonical &#x60;url&#x60;, and, when known, the path, query, header and JSON body bindings of each input.  | [optional]
**Example** | Pointer to **interface{}** |  | [optional]
**Access** | [**SearchCompactAccess**](SearchCompactAccess.md) |  |
**Attribution** | Pointer to [**SearchCompactResultAttribution**](SearchCompactResultAttribution.md) |  | [optional]
**Output** | Pointer to **map[string]interface{}** | Media type, execution mode, a bounded output summary and, for async work, the poll workflow. | [optional]
**Docs** | Pointer to [**SearchHelperDocs**](SearchHelperDocs.md) |  | [optional]
**ContractUrl** | **string** | Content-addressed full Weft contract. GET it with your Weft credential (a buyer account key, an OAuth token with the &#x60;search&#x60; scope, or a claimed &#x60;wbt_*&#x60; bootstrap bearer) before you build a request the summary does not fully describe. A pending bootstrap bearer gets &#x60;401&#x60; until a human approves the account.  |
**ContractDetail** | **string** | What this summary leaves out of the full contract. |
**Completion** | Pointer to **string** | Completion guidance when the completion rules did not fit inline. | [optional]
**BlockedScopes** | Pointer to [**[]SearchCompactResultBlockedScopesInner**](SearchCompactResultBlockedScopesInner.md) |  | [optional]
**ContractGaps** | Pointer to **[]string** | Contract fields that the review did not complete. | [optional]
**Readiness** | [**map[string]SearchCompactResultBlockedScopesInner**](SearchCompactResultBlockedScopesInner.md) | Independent readiness claims (&#x60;research&#x60;, &#x60;contract&#x60;, &#x60;runtime&#x60;, &#x60;paid_terminal&#x60;), each with a &#x60;state&#x60; and, when it fits, a &#x60;scope&#x60;.  |
**NextCall** | Pointer to [**SearchCompactNextCall**](SearchCompactNextCall.md) |  | [optional]

## Methods

### NewSearchCompactResult

`func NewSearchCompactResult(operation SearchCompactResultOperation, access SearchCompactAccess, contractUrl string, contractDetail string, readiness map[string]SearchCompactResultBlockedScopesInner, ) *SearchCompactResult`

NewSearchCompactResult instantiates a new SearchCompactResult object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchCompactResultWithDefaults

`func NewSearchCompactResultWithDefaults() *SearchCompactResult`

NewSearchCompactResultWithDefaults instantiates a new SearchCompactResult object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetProvider

`func (o *SearchCompactResult) GetProvider() SearchCompactResultProvider`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *SearchCompactResult) GetProviderOk() (*SearchCompactResultProvider, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *SearchCompactResult) SetProvider(v SearchCompactResultProvider)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *SearchCompactResult) HasProvider() bool`

HasProvider returns a boolean if a field has been set.

### GetOperation

`func (o *SearchCompactResult) GetOperation() SearchCompactResultOperation`

GetOperation returns the Operation field if non-nil, zero value otherwise.

### GetOperationOk

`func (o *SearchCompactResult) GetOperationOk() (*SearchCompactResultOperation, bool)`

GetOperationOk returns a tuple with the Operation field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOperation

`func (o *SearchCompactResult) SetOperation(v SearchCompactResultOperation)`

SetOperation sets Operation field to given value.


### GetInputs

`func (o *SearchCompactResult) GetInputs() map[string]interface{}`

GetInputs returns the Inputs field if non-nil, zero value otherwise.

### GetInputsOk

`func (o *SearchCompactResult) GetInputsOk() (*map[string]interface{}, bool)`

GetInputsOk returns a tuple with the Inputs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputs

`func (o *SearchCompactResult) SetInputs(v map[string]interface{})`

SetInputs sets Inputs field to given value.

### HasInputs

`func (o *SearchCompactResult) HasInputs() bool`

HasInputs returns a boolean if a field has been set.

### GetRequest

`func (o *SearchCompactResult) GetRequest() map[string]interface{}`

GetRequest returns the Request field if non-nil, zero value otherwise.

### GetRequestOk

`func (o *SearchCompactResult) GetRequestOk() (*map[string]interface{}, bool)`

GetRequestOk returns a tuple with the Request field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRequest

`func (o *SearchCompactResult) SetRequest(v map[string]interface{})`

SetRequest sets Request field to given value.

### HasRequest

`func (o *SearchCompactResult) HasRequest() bool`

HasRequest returns a boolean if a field has been set.

### GetExample

`func (o *SearchCompactResult) GetExample() interface{}`

GetExample returns the Example field if non-nil, zero value otherwise.

### GetExampleOk

`func (o *SearchCompactResult) GetExampleOk() (*interface{}, bool)`

GetExampleOk returns a tuple with the Example field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetExample

`func (o *SearchCompactResult) SetExample(v interface{})`

SetExample sets Example field to given value.

### HasExample

`func (o *SearchCompactResult) HasExample() bool`

HasExample returns a boolean if a field has been set.

### SetExampleNil

`func (o *SearchCompactResult) SetExampleNil(b bool)`

 SetExampleNil sets the value for Example to be an explicit nil

### UnsetExample
`func (o *SearchCompactResult) UnsetExample()`

UnsetExample ensures that no value is present for Example, not even an explicit nil
### GetAccess

`func (o *SearchCompactResult) GetAccess() SearchCompactAccess`

GetAccess returns the Access field if non-nil, zero value otherwise.

### GetAccessOk

`func (o *SearchCompactResult) GetAccessOk() (*SearchCompactAccess, bool)`

GetAccessOk returns a tuple with the Access field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAccess

`func (o *SearchCompactResult) SetAccess(v SearchCompactAccess)`

SetAccess sets Access field to given value.


### GetAttribution

`func (o *SearchCompactResult) GetAttribution() SearchCompactResultAttribution`

GetAttribution returns the Attribution field if non-nil, zero value otherwise.

### GetAttributionOk

`func (o *SearchCompactResult) GetAttributionOk() (*SearchCompactResultAttribution, bool)`

GetAttributionOk returns a tuple with the Attribution field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAttribution

`func (o *SearchCompactResult) SetAttribution(v SearchCompactResultAttribution)`

SetAttribution sets Attribution field to given value.

### HasAttribution

`func (o *SearchCompactResult) HasAttribution() bool`

HasAttribution returns a boolean if a field has been set.

### GetOutput

`func (o *SearchCompactResult) GetOutput() map[string]interface{}`

GetOutput returns the Output field if non-nil, zero value otherwise.

### GetOutputOk

`func (o *SearchCompactResult) GetOutputOk() (*map[string]interface{}, bool)`

GetOutputOk returns a tuple with the Output field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutput

`func (o *SearchCompactResult) SetOutput(v map[string]interface{})`

SetOutput sets Output field to given value.

### HasOutput

`func (o *SearchCompactResult) HasOutput() bool`

HasOutput returns a boolean if a field has been set.

### GetDocs

`func (o *SearchCompactResult) GetDocs() SearchHelperDocs`

GetDocs returns the Docs field if non-nil, zero value otherwise.

### GetDocsOk

`func (o *SearchCompactResult) GetDocsOk() (*SearchHelperDocs, bool)`

GetDocsOk returns a tuple with the Docs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDocs

`func (o *SearchCompactResult) SetDocs(v SearchHelperDocs)`

SetDocs sets Docs field to given value.

### HasDocs

`func (o *SearchCompactResult) HasDocs() bool`

HasDocs returns a boolean if a field has been set.

### GetContractUrl

`func (o *SearchCompactResult) GetContractUrl() string`

GetContractUrl returns the ContractUrl field if non-nil, zero value otherwise.

### GetContractUrlOk

`func (o *SearchCompactResult) GetContractUrlOk() (*string, bool)`

GetContractUrlOk returns a tuple with the ContractUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContractUrl

`func (o *SearchCompactResult) SetContractUrl(v string)`

SetContractUrl sets ContractUrl field to given value.


### GetContractDetail

`func (o *SearchCompactResult) GetContractDetail() string`

GetContractDetail returns the ContractDetail field if non-nil, zero value otherwise.

### GetContractDetailOk

`func (o *SearchCompactResult) GetContractDetailOk() (*string, bool)`

GetContractDetailOk returns a tuple with the ContractDetail field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContractDetail

`func (o *SearchCompactResult) SetContractDetail(v string)`

SetContractDetail sets ContractDetail field to given value.


### GetCompletion

`func (o *SearchCompactResult) GetCompletion() string`

GetCompletion returns the Completion field if non-nil, zero value otherwise.

### GetCompletionOk

`func (o *SearchCompactResult) GetCompletionOk() (*string, bool)`

GetCompletionOk returns a tuple with the Completion field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletion

`func (o *SearchCompactResult) SetCompletion(v string)`

SetCompletion sets Completion field to given value.

### HasCompletion

`func (o *SearchCompactResult) HasCompletion() bool`

HasCompletion returns a boolean if a field has been set.

### GetBlockedScopes

`func (o *SearchCompactResult) GetBlockedScopes() []SearchCompactResultBlockedScopesInner`

GetBlockedScopes returns the BlockedScopes field if non-nil, zero value otherwise.

### GetBlockedScopesOk

`func (o *SearchCompactResult) GetBlockedScopesOk() (*[]SearchCompactResultBlockedScopesInner, bool)`

GetBlockedScopesOk returns a tuple with the BlockedScopes field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBlockedScopes

`func (o *SearchCompactResult) SetBlockedScopes(v []SearchCompactResultBlockedScopesInner)`

SetBlockedScopes sets BlockedScopes field to given value.

### HasBlockedScopes

`func (o *SearchCompactResult) HasBlockedScopes() bool`

HasBlockedScopes returns a boolean if a field has been set.

### GetContractGaps

`func (o *SearchCompactResult) GetContractGaps() []string`

GetContractGaps returns the ContractGaps field if non-nil, zero value otherwise.

### GetContractGapsOk

`func (o *SearchCompactResult) GetContractGapsOk() (*[]string, bool)`

GetContractGapsOk returns a tuple with the ContractGaps field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContractGaps

`func (o *SearchCompactResult) SetContractGaps(v []string)`

SetContractGaps sets ContractGaps field to given value.

### HasContractGaps

`func (o *SearchCompactResult) HasContractGaps() bool`

HasContractGaps returns a boolean if a field has been set.

### GetReadiness

`func (o *SearchCompactResult) GetReadiness() map[string]SearchCompactResultBlockedScopesInner`

GetReadiness returns the Readiness field if non-nil, zero value otherwise.

### GetReadinessOk

`func (o *SearchCompactResult) GetReadinessOk() (*map[string]SearchCompactResultBlockedScopesInner, bool)`

GetReadinessOk returns a tuple with the Readiness field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReadiness

`func (o *SearchCompactResult) SetReadiness(v map[string]SearchCompactResultBlockedScopesInner)`

SetReadiness sets Readiness field to given value.


### GetNextCall

`func (o *SearchCompactResult) GetNextCall() SearchCompactNextCall`

GetNextCall returns the NextCall field if non-nil, zero value otherwise.

### GetNextCallOk

`func (o *SearchCompactResult) GetNextCallOk() (*SearchCompactNextCall, bool)`

GetNextCallOk returns a tuple with the NextCall field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNextCall

`func (o *SearchCompactResult) SetNextCall(v SearchCompactNextCall)`

SetNextCall sets NextCall field to given value.

### HasNextCall

`func (o *SearchCompactResult) HasNextCall() bool`

HasNextCall returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
