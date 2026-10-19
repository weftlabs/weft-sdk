# SearchCompactAccess

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** | The &#x60;access_method_id&#x60; to send to &#x60;POST /api/v1/fetch&#x60;. | [optional]
**Protocol** | Pointer to **string** |  | [optional]
**WeftFetch** | Pointer to **map[string]interface{}** | Whether the Weft fetch runtime can pay this access method (&#x60;state&#x60;, and &#x60;reason&#x60; and &#x60;coverage&#x60; when they fit). | [optional]
**Price** | Pointer to [**SearchCompactAccessPrice**](SearchCompactAccessPrice.md) |  | [optional]

## Methods

### NewSearchCompactAccess

`func NewSearchCompactAccess() *SearchCompactAccess`

NewSearchCompactAccess instantiates a new SearchCompactAccess object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchCompactAccessWithDefaults

`func NewSearchCompactAccessWithDefaults() *SearchCompactAccess`

NewSearchCompactAccessWithDefaults instantiates a new SearchCompactAccess object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *SearchCompactAccess) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *SearchCompactAccess) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *SearchCompactAccess) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *SearchCompactAccess) HasId() bool`

HasId returns a boolean if a field has been set.

### GetProtocol

`func (o *SearchCompactAccess) GetProtocol() string`

GetProtocol returns the Protocol field if non-nil, zero value otherwise.

### GetProtocolOk

`func (o *SearchCompactAccess) GetProtocolOk() (*string, bool)`

GetProtocolOk returns a tuple with the Protocol field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProtocol

`func (o *SearchCompactAccess) SetProtocol(v string)`

SetProtocol sets Protocol field to given value.

### HasProtocol

`func (o *SearchCompactAccess) HasProtocol() bool`

HasProtocol returns a boolean if a field has been set.

### GetWeftFetch

`func (o *SearchCompactAccess) GetWeftFetch() map[string]interface{}`

GetWeftFetch returns the WeftFetch field if non-nil, zero value otherwise.

### GetWeftFetchOk

`func (o *SearchCompactAccess) GetWeftFetchOk() (*map[string]interface{}, bool)`

GetWeftFetchOk returns a tuple with the WeftFetch field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWeftFetch

`func (o *SearchCompactAccess) SetWeftFetch(v map[string]interface{})`

SetWeftFetch sets WeftFetch field to given value.

### HasWeftFetch

`func (o *SearchCompactAccess) HasWeftFetch() bool`

HasWeftFetch returns a boolean if a field has been set.

### GetPrice

`func (o *SearchCompactAccess) GetPrice() SearchCompactAccessPrice`

GetPrice returns the Price field if non-nil, zero value otherwise.

### GetPriceOk

`func (o *SearchCompactAccess) GetPriceOk() (*SearchCompactAccessPrice, bool)`

GetPriceOk returns a tuple with the Price field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrice

`func (o *SearchCompactAccess) SetPrice(v SearchCompactAccessPrice)`

SetPrice sets Price field to given value.

### HasPrice

`func (o *SearchCompactAccess) HasPrice() bool`

HasPrice returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
