# Fetch403Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Error** | **string** |  |
**Details** | **map[string]interface{}** | Optional context. Shape varies by error code.  &#x60;purchase_id&#x60; (opaque string) is present when the failure follows a payment row for this request — a new, resumed, or replayed payment. It is the id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts: read that purchase to learn whether the charge settled, instead of assuming either outcome. It is absent when the request was refused before any payment row existed.  |
**Policy** | [**SpendingPolicy**](SpendingPolicy.md) |  |
**Balance** | [**FetchBalanceSnapshot**](FetchBalanceSnapshot.md) |  |
**DashboardUrl** | **string** | Deep-link to the dashboard&#39;s policy page. |
**ErrorDescription** | **string** |  |
**Scope** | **string** | Space-delimited list of scopes the endpoint requires. |

## Methods

### NewFetch403Response

`func NewFetch403Response(error_ string, details map[string]interface{}, policy SpendingPolicy, balance FetchBalanceSnapshot, dashboardUrl string, errorDescription string, scope string, ) *Fetch403Response`

NewFetch403Response instantiates a new Fetch403Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewFetch403ResponseWithDefaults

`func NewFetch403ResponseWithDefaults() *Fetch403Response`

NewFetch403ResponseWithDefaults instantiates a new Fetch403Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetError

`func (o *Fetch403Response) GetError() string`

GetError returns the Error field if non-nil, zero value otherwise.

### GetErrorOk

`func (o *Fetch403Response) GetErrorOk() (*string, bool)`

GetErrorOk returns a tuple with the Error field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetError

`func (o *Fetch403Response) SetError(v string)`

SetError sets Error field to given value.


### GetDetails

`func (o *Fetch403Response) GetDetails() map[string]interface{}`

GetDetails returns the Details field if non-nil, zero value otherwise.

### GetDetailsOk

`func (o *Fetch403Response) GetDetailsOk() (*map[string]interface{}, bool)`

GetDetailsOk returns a tuple with the Details field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDetails

`func (o *Fetch403Response) SetDetails(v map[string]interface{})`

SetDetails sets Details field to given value.


### GetPolicy

`func (o *Fetch403Response) GetPolicy() SpendingPolicy`

GetPolicy returns the Policy field if non-nil, zero value otherwise.

### GetPolicyOk

`func (o *Fetch403Response) GetPolicyOk() (*SpendingPolicy, bool)`

GetPolicyOk returns a tuple with the Policy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPolicy

`func (o *Fetch403Response) SetPolicy(v SpendingPolicy)`

SetPolicy sets Policy field to given value.


### GetBalance

`func (o *Fetch403Response) GetBalance() FetchBalanceSnapshot`

GetBalance returns the Balance field if non-nil, zero value otherwise.

### GetBalanceOk

`func (o *Fetch403Response) GetBalanceOk() (*FetchBalanceSnapshot, bool)`

GetBalanceOk returns a tuple with the Balance field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBalance

`func (o *Fetch403Response) SetBalance(v FetchBalanceSnapshot)`

SetBalance sets Balance field to given value.


### GetDashboardUrl

`func (o *Fetch403Response) GetDashboardUrl() string`

GetDashboardUrl returns the DashboardUrl field if non-nil, zero value otherwise.

### GetDashboardUrlOk

`func (o *Fetch403Response) GetDashboardUrlOk() (*string, bool)`

GetDashboardUrlOk returns a tuple with the DashboardUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDashboardUrl

`func (o *Fetch403Response) SetDashboardUrl(v string)`

SetDashboardUrl sets DashboardUrl field to given value.


### GetErrorDescription

`func (o *Fetch403Response) GetErrorDescription() string`

GetErrorDescription returns the ErrorDescription field if non-nil, zero value otherwise.

### GetErrorDescriptionOk

`func (o *Fetch403Response) GetErrorDescriptionOk() (*string, bool)`

GetErrorDescriptionOk returns a tuple with the ErrorDescription field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetErrorDescription

`func (o *Fetch403Response) SetErrorDescription(v string)`

SetErrorDescription sets ErrorDescription field to given value.


### GetScope

`func (o *Fetch403Response) GetScope() string`

GetScope returns the Scope field if non-nil, zero value otherwise.

### GetScopeOk

`func (o *Fetch403Response) GetScopeOk() (*string, bool)`

GetScopeOk returns a tuple with the Scope field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetScope

`func (o *Fetch403Response) SetScope(v string)`

SetScope sets Scope field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
