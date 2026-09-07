# FetchResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Status** | **int32** | HTTP status returned by the upstream after the paid replay. |
**Headers** | **map[string]string** | Response headers from the upstream. |
**BodyBase64** | **string** | Base64-encoded response body. Empty string for empty bodies. |
**PaidUsd** | **string** | USD amount actually settled on-chain. \&quot;0.00\&quot; for any charge that hasn&#39;t (yet, or ever) settled — a signed hold is not yet spend. See &#x60;held_usd&#x60; for the nominal amount in that case. Exact to the micro-dollar, minimum two decimals; parse as a decimal rather than string-comparing against a bare zero literal.  |
**HeldUsd** | **string** | The nominal charge amount when &#x60;paid_usd&#x60; is \&quot;0.00\&quot; — a hold awaiting settlement, or a charge that failed/expired without ever settling. &#x60;null&#x60; once &#x60;paid_usd&#x60; reflects the real settlement. Same format as &#x60;paid_usd&#x60;: exact to the micro-dollar, minimum two decimals.  |
**PaymentStatus** | **string** | Agent-facing settlement status. &#x60;pending&#x60; &#x3D; signed, no refusal signal yet (settlement may still land, e.g. x402&#39;s async facilitator webhook). &#x60;declined-pending&#x60; &#x3D; the merchant refused but the authorization isn&#39;t provably dead yet. &#x60;declined&#x60; / &#x60;expired&#x60; / &#x60;reverted&#x60; are terminal — the money never moved (or, for &#x60;reverted&#x60;, moved and then reversed on-chain) and never will for this charge.  |
**TxHash** | **string** | Settlement transaction hash. Null until a settlement hash has been reported. |
**Protocol** | **string** | Payment protocol selected for this fetch. |
**ArtifactId** | **int32** | Internal artifact identifier if the response was persisted; &#x60;null&#x60; otherwise. |

## Methods

### NewFetchResponse

`func NewFetchResponse(status int32, headers map[string]string, bodyBase64 string, paidUsd string, heldUsd string, paymentStatus string, txHash string, protocol string, artifactId int32, ) *FetchResponse`

NewFetchResponse instantiates a new FetchResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewFetchResponseWithDefaults

`func NewFetchResponseWithDefaults() *FetchResponse`

NewFetchResponseWithDefaults instantiates a new FetchResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetStatus

`func (o *FetchResponse) GetStatus() int32`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *FetchResponse) GetStatusOk() (*int32, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *FetchResponse) SetStatus(v int32)`

SetStatus sets Status field to given value.


### GetHeaders

`func (o *FetchResponse) GetHeaders() map[string]string`

GetHeaders returns the Headers field if non-nil, zero value otherwise.

### GetHeadersOk

`func (o *FetchResponse) GetHeadersOk() (*map[string]string, bool)`

GetHeadersOk returns a tuple with the Headers field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHeaders

`func (o *FetchResponse) SetHeaders(v map[string]string)`

SetHeaders sets Headers field to given value.


### GetBodyBase64

`func (o *FetchResponse) GetBodyBase64() string`

GetBodyBase64 returns the BodyBase64 field if non-nil, zero value otherwise.

### GetBodyBase64Ok

`func (o *FetchResponse) GetBodyBase64Ok() (*string, bool)`

GetBodyBase64Ok returns a tuple with the BodyBase64 field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBodyBase64

`func (o *FetchResponse) SetBodyBase64(v string)`

SetBodyBase64 sets BodyBase64 field to given value.


### GetPaidUsd

`func (o *FetchResponse) GetPaidUsd() string`

GetPaidUsd returns the PaidUsd field if non-nil, zero value otherwise.

### GetPaidUsdOk

`func (o *FetchResponse) GetPaidUsdOk() (*string, bool)`

GetPaidUsdOk returns a tuple with the PaidUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPaidUsd

`func (o *FetchResponse) SetPaidUsd(v string)`

SetPaidUsd sets PaidUsd field to given value.


### GetHeldUsd

`func (o *FetchResponse) GetHeldUsd() string`

GetHeldUsd returns the HeldUsd field if non-nil, zero value otherwise.

### GetHeldUsdOk

`func (o *FetchResponse) GetHeldUsdOk() (*string, bool)`

GetHeldUsdOk returns a tuple with the HeldUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHeldUsd

`func (o *FetchResponse) SetHeldUsd(v string)`

SetHeldUsd sets HeldUsd field to given value.


### GetPaymentStatus

`func (o *FetchResponse) GetPaymentStatus() string`

GetPaymentStatus returns the PaymentStatus field if non-nil, zero value otherwise.

### GetPaymentStatusOk

`func (o *FetchResponse) GetPaymentStatusOk() (*string, bool)`

GetPaymentStatusOk returns a tuple with the PaymentStatus field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPaymentStatus

`func (o *FetchResponse) SetPaymentStatus(v string)`

SetPaymentStatus sets PaymentStatus field to given value.


### GetTxHash

`func (o *FetchResponse) GetTxHash() string`

GetTxHash returns the TxHash field if non-nil, zero value otherwise.

### GetTxHashOk

`func (o *FetchResponse) GetTxHashOk() (*string, bool)`

GetTxHashOk returns a tuple with the TxHash field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTxHash

`func (o *FetchResponse) SetTxHash(v string)`

SetTxHash sets TxHash field to given value.


### GetProtocol

`func (o *FetchResponse) GetProtocol() string`

GetProtocol returns the Protocol field if non-nil, zero value otherwise.

### GetProtocolOk

`func (o *FetchResponse) GetProtocolOk() (*string, bool)`

GetProtocolOk returns a tuple with the Protocol field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProtocol

`func (o *FetchResponse) SetProtocol(v string)`

SetProtocol sets Protocol field to given value.


### GetArtifactId

`func (o *FetchResponse) GetArtifactId() int32`

GetArtifactId returns the ArtifactId field if non-nil, zero value otherwise.

### GetArtifactIdOk

`func (o *FetchResponse) GetArtifactIdOk() (*int32, bool)`

GetArtifactIdOk returns a tuple with the ArtifactId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetArtifactId

`func (o *FetchResponse) SetArtifactId(v int32)`

SetArtifactId sets ArtifactId field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
