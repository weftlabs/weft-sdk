# FetchRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Url** | **string** | Target URL. Must pass Weft&#39;s URL safety check (no SSRF / private IP ranges). |
**MaxCostUsd** | Pointer to **string** | Merchant-principal ceiling, excluding gas, provider fees and prerequisites. Defaults to &#x60;0.10&#x60; USD; use &#x60;max_total_cost_usd&#x60; for an all-in bound. | [optional] [default to "0.10"]
**AllowTempoRefill** | Pointer to **bool** | Whether this request may create, adopt, or enqueue a Base-to-Tempo refill. Only JSON booleans are accepted. Omission allows legacy refill behavior unless &#x60;max_total_cost_usd&#x60; is supplied, in which case refill is disabled. False leaves unrelated bridges and jobs unchanged and reports an unfunded Tempo pocket as &#x60;INSUFFICIENT_BALANCE&#x60;. This does not select a rail or bound fees.  | [optional]
**MaxTotalCostUsd** | Pointer to **string** | Optional all-in buyer-debit ceiling in USD, including principal, gas, provider fees and prerequisite operations. Requires a binding upstream upper bound before any payment effect. Current integrations have no such guarantee, so requests requiring wallet signing or payment fail closed with &#x60;TOTAL_COST_UNVERIFIABLE&#x60;, including recovery and replay of previous payments. No positive paid route is currently admitted in this mode. Estimates, expected sponsorship and receipts are not authority. Implies no refill; explicit &#x60;allow_tempo_refill: true&#x60; is invalid. Omission preserves legacy behavior.  | [optional]
**Method** | Pointer to **string** | HTTP method to use against the upstream. | [optional] [default to "GET"]
**Body** | Pointer to [**NullableFetchRequestBody**](FetchRequestBody.md) |  | [optional]
**Headers** | Pointer to **map[string]string** | Headers forwarded to the upstream. Up to 32 headers, 4 KB total. The following are silently stripped: &#x60;host&#x60;, &#x60;authorization&#x60;, &#x60;cookie&#x60;, &#x60;proxy-authorization&#x60;, &#x60;x-forwarded-*&#x60;, &#x60;x-real-ip&#x60;, &#x60;x-payment&#x60;, &#x60;connection&#x60;, &#x60;upgrade&#x60;.  | [optional]
**SearchId** | Pointer to **string** | The &#x60;query_trace_id&#x60; from the &#x60;POST /api/v1/search&#x60; response that surfaced this URL. Optional and advisory: it attributes the purchase to the search that found it, and is used only for measurement.  It never affects payment, authorization, idempotency, or the response body — the buyer is always resolved from the credential, never from this field. A value that is not a well-formed handle is ignored rather than rejected, so an analytics mistake can never cost a fetch.  | [optional]
**OperationId** | Pointer to **string** | Advisory operation id returned by search. | [optional]
**AccessMethodId** | Pointer to **string** | Advisory access-method id returned by search; does not enforce a payment rail. | [optional]

## Methods

### NewFetchRequest

`func NewFetchRequest(url string, ) *FetchRequest`

NewFetchRequest instantiates a new FetchRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewFetchRequestWithDefaults

`func NewFetchRequestWithDefaults() *FetchRequest`

NewFetchRequestWithDefaults instantiates a new FetchRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetUrl

`func (o *FetchRequest) GetUrl() string`

GetUrl returns the Url field if non-nil, zero value otherwise.

### GetUrlOk

`func (o *FetchRequest) GetUrlOk() (*string, bool)`

GetUrlOk returns a tuple with the Url field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUrl

`func (o *FetchRequest) SetUrl(v string)`

SetUrl sets Url field to given value.


### GetMaxCostUsd

`func (o *FetchRequest) GetMaxCostUsd() string`

GetMaxCostUsd returns the MaxCostUsd field if non-nil, zero value otherwise.

### GetMaxCostUsdOk

`func (o *FetchRequest) GetMaxCostUsdOk() (*string, bool)`

GetMaxCostUsdOk returns a tuple with the MaxCostUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxCostUsd

`func (o *FetchRequest) SetMaxCostUsd(v string)`

SetMaxCostUsd sets MaxCostUsd field to given value.

### HasMaxCostUsd

`func (o *FetchRequest) HasMaxCostUsd() bool`

HasMaxCostUsd returns a boolean if a field has been set.

### GetAllowTempoRefill

`func (o *FetchRequest) GetAllowTempoRefill() bool`

GetAllowTempoRefill returns the AllowTempoRefill field if non-nil, zero value otherwise.

### GetAllowTempoRefillOk

`func (o *FetchRequest) GetAllowTempoRefillOk() (*bool, bool)`

GetAllowTempoRefillOk returns a tuple with the AllowTempoRefill field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAllowTempoRefill

`func (o *FetchRequest) SetAllowTempoRefill(v bool)`

SetAllowTempoRefill sets AllowTempoRefill field to given value.

### HasAllowTempoRefill

`func (o *FetchRequest) HasAllowTempoRefill() bool`

HasAllowTempoRefill returns a boolean if a field has been set.

### GetMaxTotalCostUsd

`func (o *FetchRequest) GetMaxTotalCostUsd() string`

GetMaxTotalCostUsd returns the MaxTotalCostUsd field if non-nil, zero value otherwise.

### GetMaxTotalCostUsdOk

`func (o *FetchRequest) GetMaxTotalCostUsdOk() (*string, bool)`

GetMaxTotalCostUsdOk returns a tuple with the MaxTotalCostUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxTotalCostUsd

`func (o *FetchRequest) SetMaxTotalCostUsd(v string)`

SetMaxTotalCostUsd sets MaxTotalCostUsd field to given value.

### HasMaxTotalCostUsd

`func (o *FetchRequest) HasMaxTotalCostUsd() bool`

HasMaxTotalCostUsd returns a boolean if a field has been set.

### GetMethod

`func (o *FetchRequest) GetMethod() string`

GetMethod returns the Method field if non-nil, zero value otherwise.

### GetMethodOk

`func (o *FetchRequest) GetMethodOk() (*string, bool)`

GetMethodOk returns a tuple with the Method field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMethod

`func (o *FetchRequest) SetMethod(v string)`

SetMethod sets Method field to given value.

### HasMethod

`func (o *FetchRequest) HasMethod() bool`

HasMethod returns a boolean if a field has been set.

### GetBody

`func (o *FetchRequest) GetBody() FetchRequestBody`

GetBody returns the Body field if non-nil, zero value otherwise.

### GetBodyOk

`func (o *FetchRequest) GetBodyOk() (*FetchRequestBody, bool)`

GetBodyOk returns a tuple with the Body field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBody

`func (o *FetchRequest) SetBody(v FetchRequestBody)`

SetBody sets Body field to given value.

### HasBody

`func (o *FetchRequest) HasBody() bool`

HasBody returns a boolean if a field has been set.

### SetBodyNil

`func (o *FetchRequest) SetBodyNil(b bool)`

 SetBodyNil sets the value for Body to be an explicit nil

### UnsetBody
`func (o *FetchRequest) UnsetBody()`

UnsetBody ensures that no value is present for Body, not even an explicit nil
### GetHeaders

`func (o *FetchRequest) GetHeaders() map[string]string`

GetHeaders returns the Headers field if non-nil, zero value otherwise.

### GetHeadersOk

`func (o *FetchRequest) GetHeadersOk() (*map[string]string, bool)`

GetHeadersOk returns a tuple with the Headers field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHeaders

`func (o *FetchRequest) SetHeaders(v map[string]string)`

SetHeaders sets Headers field to given value.

### HasHeaders

`func (o *FetchRequest) HasHeaders() bool`

HasHeaders returns a boolean if a field has been set.

### GetSearchId

`func (o *FetchRequest) GetSearchId() string`

GetSearchId returns the SearchId field if non-nil, zero value otherwise.

### GetSearchIdOk

`func (o *FetchRequest) GetSearchIdOk() (*string, bool)`

GetSearchIdOk returns a tuple with the SearchId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSearchId

`func (o *FetchRequest) SetSearchId(v string)`

SetSearchId sets SearchId field to given value.

### HasSearchId

`func (o *FetchRequest) HasSearchId() bool`

HasSearchId returns a boolean if a field has been set.

### GetOperationId

`func (o *FetchRequest) GetOperationId() string`

GetOperationId returns the OperationId field if non-nil, zero value otherwise.

### GetOperationIdOk

`func (o *FetchRequest) GetOperationIdOk() (*string, bool)`

GetOperationIdOk returns a tuple with the OperationId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOperationId

`func (o *FetchRequest) SetOperationId(v string)`

SetOperationId sets OperationId field to given value.

### HasOperationId

`func (o *FetchRequest) HasOperationId() bool`

HasOperationId returns a boolean if a field has been set.

### GetAccessMethodId

`func (o *FetchRequest) GetAccessMethodId() string`

GetAccessMethodId returns the AccessMethodId field if non-nil, zero value otherwise.

### GetAccessMethodIdOk

`func (o *FetchRequest) GetAccessMethodIdOk() (*string, bool)`

GetAccessMethodIdOk returns a tuple with the AccessMethodId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAccessMethodId

`func (o *FetchRequest) SetAccessMethodId(v string)`

SetAccessMethodId sets AccessMethodId field to given value.

### HasAccessMethodId

`func (o *FetchRequest) HasAccessMethodId() bool`

HasAccessMethodId returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
