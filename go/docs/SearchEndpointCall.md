# SearchEndpointCall

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Method** | Pointer to **string** | The HTTP verb to send. Empty string when neither the index nor the provider&#39;s own 402 challenge / OpenAPI spec declares one.  | [optional]
**InputSchema** | Pointer to [**NullableSearchEndpointCallInputSchema**](SearchEndpointCallInputSchema.md) |  | [optional]
**ExampleRequest** | Pointer to **map[string]interface{}** | A worked set of arguments grouped by slot (&#x60;query&#x60; / &#x60;body&#x60; / &#x60;path&#x60;). Every value is one the PROVIDER published; never synthesized.  | [optional]
**ExampleResponse** | Pointer to **interface{}** |  | [optional]

## Methods

### NewSearchEndpointCall

`func NewSearchEndpointCall() *SearchEndpointCall`

NewSearchEndpointCall instantiates a new SearchEndpointCall object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchEndpointCallWithDefaults

`func NewSearchEndpointCallWithDefaults() *SearchEndpointCall`

NewSearchEndpointCallWithDefaults instantiates a new SearchEndpointCall object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetMethod

`func (o *SearchEndpointCall) GetMethod() string`

GetMethod returns the Method field if non-nil, zero value otherwise.

### GetMethodOk

`func (o *SearchEndpointCall) GetMethodOk() (*string, bool)`

GetMethodOk returns a tuple with the Method field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMethod

`func (o *SearchEndpointCall) SetMethod(v string)`

SetMethod sets Method field to given value.

### HasMethod

`func (o *SearchEndpointCall) HasMethod() bool`

HasMethod returns a boolean if a field has been set.

### GetInputSchema

`func (o *SearchEndpointCall) GetInputSchema() SearchEndpointCallInputSchema`

GetInputSchema returns the InputSchema field if non-nil, zero value otherwise.

### GetInputSchemaOk

`func (o *SearchEndpointCall) GetInputSchemaOk() (*SearchEndpointCallInputSchema, bool)`

GetInputSchemaOk returns a tuple with the InputSchema field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputSchema

`func (o *SearchEndpointCall) SetInputSchema(v SearchEndpointCallInputSchema)`

SetInputSchema sets InputSchema field to given value.

### HasInputSchema

`func (o *SearchEndpointCall) HasInputSchema() bool`

HasInputSchema returns a boolean if a field has been set.

### SetInputSchemaNil

`func (o *SearchEndpointCall) SetInputSchemaNil(b bool)`

 SetInputSchemaNil sets the value for InputSchema to be an explicit nil

### UnsetInputSchema
`func (o *SearchEndpointCall) UnsetInputSchema()`

UnsetInputSchema ensures that no value is present for InputSchema, not even an explicit nil
### GetExampleRequest

`func (o *SearchEndpointCall) GetExampleRequest() map[string]interface{}`

GetExampleRequest returns the ExampleRequest field if non-nil, zero value otherwise.

### GetExampleRequestOk

`func (o *SearchEndpointCall) GetExampleRequestOk() (*map[string]interface{}, bool)`

GetExampleRequestOk returns a tuple with the ExampleRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetExampleRequest

`func (o *SearchEndpointCall) SetExampleRequest(v map[string]interface{})`

SetExampleRequest sets ExampleRequest field to given value.

### HasExampleRequest

`func (o *SearchEndpointCall) HasExampleRequest() bool`

HasExampleRequest returns a boolean if a field has been set.

### GetExampleResponse

`func (o *SearchEndpointCall) GetExampleResponse() interface{}`

GetExampleResponse returns the ExampleResponse field if non-nil, zero value otherwise.

### GetExampleResponseOk

`func (o *SearchEndpointCall) GetExampleResponseOk() (*interface{}, bool)`

GetExampleResponseOk returns a tuple with the ExampleResponse field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetExampleResponse

`func (o *SearchEndpointCall) SetExampleResponse(v interface{})`

SetExampleResponse sets ExampleResponse field to given value.

### HasExampleResponse

`func (o *SearchEndpointCall) HasExampleResponse() bool`

HasExampleResponse returns a boolean if a field has been set.

### SetExampleResponseNil

`func (o *SearchEndpointCall) SetExampleResponseNil(b bool)`

 SetExampleResponseNil sets the value for ExampleResponse to be an explicit nil

### UnsetExampleResponse
`func (o *SearchEndpointCall) UnsetExampleResponse()`

UnsetExampleResponse ensures that no value is present for ExampleResponse, not even an explicit nil

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
