# FetchErrorResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Error** | **string** | Stable error code. |
**Details** | **map[string]interface{}** | Optional context. Shape varies by error code.  &#x60;purchase_id&#x60; (opaque string) is present when the failure follows a payment row for this request — a new, resumed, or replayed payment. It is the id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts: read that purchase to learn whether the charge settled, instead of assuming either outcome. It is absent when the request was refused before any payment row existed.  |
**Policy** | [**SpendingPolicy**](SpendingPolicy.md) |  |
**Balance** | [**FetchBalanceSnapshot**](FetchBalanceSnapshot.md) |  |
**DashboardUrl** | **string** | Deep-link to the dashboard&#39;s policy page. |

## Methods

### NewFetchErrorResponse

`func NewFetchErrorResponse(error_ string, details map[string]interface{}, policy SpendingPolicy, balance FetchBalanceSnapshot, dashboardUrl string, ) *FetchErrorResponse`

NewFetchErrorResponse instantiates a new FetchErrorResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewFetchErrorResponseWithDefaults

`func NewFetchErrorResponseWithDefaults() *FetchErrorResponse`

NewFetchErrorResponseWithDefaults instantiates a new FetchErrorResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetError

`func (o *FetchErrorResponse) GetError() string`

GetError returns the Error field if non-nil, zero value otherwise.

### GetErrorOk

`func (o *FetchErrorResponse) GetErrorOk() (*string, bool)`

GetErrorOk returns a tuple with the Error field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetError

`func (o *FetchErrorResponse) SetError(v string)`

SetError sets Error field to given value.


### GetDetails

`func (o *FetchErrorResponse) GetDetails() map[string]interface{}`

GetDetails returns the Details field if non-nil, zero value otherwise.

### GetDetailsOk

`func (o *FetchErrorResponse) GetDetailsOk() (*map[string]interface{}, bool)`

GetDetailsOk returns a tuple with the Details field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDetails

`func (o *FetchErrorResponse) SetDetails(v map[string]interface{})`

SetDetails sets Details field to given value.


### GetPolicy

`func (o *FetchErrorResponse) GetPolicy() SpendingPolicy`

GetPolicy returns the Policy field if non-nil, zero value otherwise.

### GetPolicyOk

`func (o *FetchErrorResponse) GetPolicyOk() (*SpendingPolicy, bool)`

GetPolicyOk returns a tuple with the Policy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPolicy

`func (o *FetchErrorResponse) SetPolicy(v SpendingPolicy)`

SetPolicy sets Policy field to given value.


### GetBalance

`func (o *FetchErrorResponse) GetBalance() FetchBalanceSnapshot`

GetBalance returns the Balance field if non-nil, zero value otherwise.

### GetBalanceOk

`func (o *FetchErrorResponse) GetBalanceOk() (*FetchBalanceSnapshot, bool)`

GetBalanceOk returns a tuple with the Balance field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBalance

`func (o *FetchErrorResponse) SetBalance(v FetchBalanceSnapshot)`

SetBalance sets Balance field to given value.


### GetDashboardUrl

`func (o *FetchErrorResponse) GetDashboardUrl() string`

GetDashboardUrl returns the DashboardUrl field if non-nil, zero value otherwise.

### GetDashboardUrlOk

`func (o *FetchErrorResponse) GetDashboardUrlOk() (*string, bool)`

GetDashboardUrlOk returns a tuple with the DashboardUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDashboardUrl

`func (o *FetchErrorResponse) SetDashboardUrl(v string)`

SetDashboardUrl sets DashboardUrl field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
