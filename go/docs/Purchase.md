# Purchase

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | **int32** |  |
**Status** | **string** |  |
**AmountUsd** | **string** | Exact decimal USD amount with up to six fractional digits. Settled rows report the amount that moved; pending and failed rows report their authorization amount. |
**RecipientAddress** | **string** |  |
**Network** | **string** |  |
**Protocol** | **NullableString** |  |
**Context** | **NullableString** |  |
**SearchId** | **NullableString** | Search trace ID used to attribute this purchase, when available. |
**AttributionStatus** | **string** |  |
**TxHash** | **NullableString** |  |
**RejectReason** | **NullableString** |  |
**FailureReason** | **NullableString** |  |
**IdempotencyKey** | **NullableString** |  |
**SignedAt** | **time.Time** |  |
**SettledAt** | **NullableTime** |  |
**Artifact** | [**NullablePurchaseArtifact**](PurchaseArtifact.md) |  |

## Methods

### NewPurchase

`func NewPurchase(id int32, status string, amountUsd string, recipientAddress string, network string, protocol NullableString, context NullableString, searchId NullableString, attributionStatus string, txHash NullableString, rejectReason NullableString, failureReason NullableString, idempotencyKey NullableString, signedAt time.Time, settledAt NullableTime, artifact NullablePurchaseArtifact, ) *Purchase`

NewPurchase instantiates a new Purchase object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewPurchaseWithDefaults

`func NewPurchaseWithDefaults() *Purchase`

NewPurchaseWithDefaults instantiates a new Purchase object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *Purchase) GetId() int32`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *Purchase) GetIdOk() (*int32, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *Purchase) SetId(v int32)`

SetId sets Id field to given value.


### GetStatus

`func (o *Purchase) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *Purchase) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *Purchase) SetStatus(v string)`

SetStatus sets Status field to given value.


### GetAmountUsd

`func (o *Purchase) GetAmountUsd() string`

GetAmountUsd returns the AmountUsd field if non-nil, zero value otherwise.

### GetAmountUsdOk

`func (o *Purchase) GetAmountUsdOk() (*string, bool)`

GetAmountUsdOk returns a tuple with the AmountUsd field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAmountUsd

`func (o *Purchase) SetAmountUsd(v string)`

SetAmountUsd sets AmountUsd field to given value.


### GetRecipientAddress

`func (o *Purchase) GetRecipientAddress() string`

GetRecipientAddress returns the RecipientAddress field if non-nil, zero value otherwise.

### GetRecipientAddressOk

`func (o *Purchase) GetRecipientAddressOk() (*string, bool)`

GetRecipientAddressOk returns a tuple with the RecipientAddress field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRecipientAddress

`func (o *Purchase) SetRecipientAddress(v string)`

SetRecipientAddress sets RecipientAddress field to given value.


### GetNetwork

`func (o *Purchase) GetNetwork() string`

GetNetwork returns the Network field if non-nil, zero value otherwise.

### GetNetworkOk

`func (o *Purchase) GetNetworkOk() (*string, bool)`

GetNetworkOk returns a tuple with the Network field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNetwork

`func (o *Purchase) SetNetwork(v string)`

SetNetwork sets Network field to given value.


### GetProtocol

`func (o *Purchase) GetProtocol() string`

GetProtocol returns the Protocol field if non-nil, zero value otherwise.

### GetProtocolOk

`func (o *Purchase) GetProtocolOk() (*string, bool)`

GetProtocolOk returns a tuple with the Protocol field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProtocol

`func (o *Purchase) SetProtocol(v string)`

SetProtocol sets Protocol field to given value.


### SetProtocolNil

`func (o *Purchase) SetProtocolNil(b bool)`

 SetProtocolNil sets the value for Protocol to be an explicit nil

### UnsetProtocol
`func (o *Purchase) UnsetProtocol()`

UnsetProtocol ensures that no value is present for Protocol, not even an explicit nil
### GetContext

`func (o *Purchase) GetContext() string`

GetContext returns the Context field if non-nil, zero value otherwise.

### GetContextOk

`func (o *Purchase) GetContextOk() (*string, bool)`

GetContextOk returns a tuple with the Context field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContext

`func (o *Purchase) SetContext(v string)`

SetContext sets Context field to given value.


### SetContextNil

`func (o *Purchase) SetContextNil(b bool)`

 SetContextNil sets the value for Context to be an explicit nil

### UnsetContext
`func (o *Purchase) UnsetContext()`

UnsetContext ensures that no value is present for Context, not even an explicit nil
### GetSearchId

`func (o *Purchase) GetSearchId() string`

GetSearchId returns the SearchId field if non-nil, zero value otherwise.

### GetSearchIdOk

`func (o *Purchase) GetSearchIdOk() (*string, bool)`

GetSearchIdOk returns a tuple with the SearchId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSearchId

`func (o *Purchase) SetSearchId(v string)`

SetSearchId sets SearchId field to given value.


### SetSearchIdNil

`func (o *Purchase) SetSearchIdNil(b bool)`

 SetSearchIdNil sets the value for SearchId to be an explicit nil

### UnsetSearchId
`func (o *Purchase) UnsetSearchId()`

UnsetSearchId ensures that no value is present for SearchId, not even an explicit nil
### GetAttributionStatus

`func (o *Purchase) GetAttributionStatus() string`

GetAttributionStatus returns the AttributionStatus field if non-nil, zero value otherwise.

### GetAttributionStatusOk

`func (o *Purchase) GetAttributionStatusOk() (*string, bool)`

GetAttributionStatusOk returns a tuple with the AttributionStatus field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAttributionStatus

`func (o *Purchase) SetAttributionStatus(v string)`

SetAttributionStatus sets AttributionStatus field to given value.


### GetTxHash

`func (o *Purchase) GetTxHash() string`

GetTxHash returns the TxHash field if non-nil, zero value otherwise.

### GetTxHashOk

`func (o *Purchase) GetTxHashOk() (*string, bool)`

GetTxHashOk returns a tuple with the TxHash field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTxHash

`func (o *Purchase) SetTxHash(v string)`

SetTxHash sets TxHash field to given value.


### SetTxHashNil

`func (o *Purchase) SetTxHashNil(b bool)`

 SetTxHashNil sets the value for TxHash to be an explicit nil

### UnsetTxHash
`func (o *Purchase) UnsetTxHash()`

UnsetTxHash ensures that no value is present for TxHash, not even an explicit nil
### GetRejectReason

`func (o *Purchase) GetRejectReason() string`

GetRejectReason returns the RejectReason field if non-nil, zero value otherwise.

### GetRejectReasonOk

`func (o *Purchase) GetRejectReasonOk() (*string, bool)`

GetRejectReasonOk returns a tuple with the RejectReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRejectReason

`func (o *Purchase) SetRejectReason(v string)`

SetRejectReason sets RejectReason field to given value.


### SetRejectReasonNil

`func (o *Purchase) SetRejectReasonNil(b bool)`

 SetRejectReasonNil sets the value for RejectReason to be an explicit nil

### UnsetRejectReason
`func (o *Purchase) UnsetRejectReason()`

UnsetRejectReason ensures that no value is present for RejectReason, not even an explicit nil
### GetFailureReason

`func (o *Purchase) GetFailureReason() string`

GetFailureReason returns the FailureReason field if non-nil, zero value otherwise.

### GetFailureReasonOk

`func (o *Purchase) GetFailureReasonOk() (*string, bool)`

GetFailureReasonOk returns a tuple with the FailureReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFailureReason

`func (o *Purchase) SetFailureReason(v string)`

SetFailureReason sets FailureReason field to given value.


### SetFailureReasonNil

`func (o *Purchase) SetFailureReasonNil(b bool)`

 SetFailureReasonNil sets the value for FailureReason to be an explicit nil

### UnsetFailureReason
`func (o *Purchase) UnsetFailureReason()`

UnsetFailureReason ensures that no value is present for FailureReason, not even an explicit nil
### GetIdempotencyKey

`func (o *Purchase) GetIdempotencyKey() string`

GetIdempotencyKey returns the IdempotencyKey field if non-nil, zero value otherwise.

### GetIdempotencyKeyOk

`func (o *Purchase) GetIdempotencyKeyOk() (*string, bool)`

GetIdempotencyKeyOk returns a tuple with the IdempotencyKey field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIdempotencyKey

`func (o *Purchase) SetIdempotencyKey(v string)`

SetIdempotencyKey sets IdempotencyKey field to given value.


### SetIdempotencyKeyNil

`func (o *Purchase) SetIdempotencyKeyNil(b bool)`

 SetIdempotencyKeyNil sets the value for IdempotencyKey to be an explicit nil

### UnsetIdempotencyKey
`func (o *Purchase) UnsetIdempotencyKey()`

UnsetIdempotencyKey ensures that no value is present for IdempotencyKey, not even an explicit nil
### GetSignedAt

`func (o *Purchase) GetSignedAt() time.Time`

GetSignedAt returns the SignedAt field if non-nil, zero value otherwise.

### GetSignedAtOk

`func (o *Purchase) GetSignedAtOk() (*time.Time, bool)`

GetSignedAtOk returns a tuple with the SignedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSignedAt

`func (o *Purchase) SetSignedAt(v time.Time)`

SetSignedAt sets SignedAt field to given value.


### GetSettledAt

`func (o *Purchase) GetSettledAt() time.Time`

GetSettledAt returns the SettledAt field if non-nil, zero value otherwise.

### GetSettledAtOk

`func (o *Purchase) GetSettledAtOk() (*time.Time, bool)`

GetSettledAtOk returns a tuple with the SettledAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSettledAt

`func (o *Purchase) SetSettledAt(v time.Time)`

SetSettledAt sets SettledAt field to given value.


### SetSettledAtNil

`func (o *Purchase) SetSettledAtNil(b bool)`

 SetSettledAtNil sets the value for SettledAt to be an explicit nil

### UnsetSettledAt
`func (o *Purchase) UnsetSettledAt()`

UnsetSettledAt ensures that no value is present for SettledAt, not even an explicit nil
### GetArtifact

`func (o *Purchase) GetArtifact() PurchaseArtifact`

GetArtifact returns the Artifact field if non-nil, zero value otherwise.

### GetArtifactOk

`func (o *Purchase) GetArtifactOk() (*PurchaseArtifact, bool)`

GetArtifactOk returns a tuple with the Artifact field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetArtifact

`func (o *Purchase) SetArtifact(v PurchaseArtifact)`

SetArtifact sets Artifact field to given value.


### SetArtifactNil

`func (o *Purchase) SetArtifactNil(b bool)`

 SetArtifactNil sets the value for Artifact to be an explicit nil

### UnsetArtifact
`func (o *Purchase) UnsetArtifact()`

UnsetArtifact ensures that no value is present for Artifact, not even an explicit nil

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
