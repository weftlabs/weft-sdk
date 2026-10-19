# SearchCompactNextCall

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Method** | **string** |  |
**Path** | **string** |  |
**Body** | **map[string]interface{}** | A &#x60;FetchRequest&#x60; with documented example values and &#x60;{name}&#x60; placeholders. |
**Fill** | **[]string** | Names to replace before you send the request. |

## Methods

### NewSearchCompactNextCall

`func NewSearchCompactNextCall(method string, path string, body map[string]interface{}, fill []string, ) *SearchCompactNextCall`

NewSearchCompactNextCall instantiates a new SearchCompactNextCall object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchCompactNextCallWithDefaults

`func NewSearchCompactNextCallWithDefaults() *SearchCompactNextCall`

NewSearchCompactNextCallWithDefaults instantiates a new SearchCompactNextCall object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetMethod

`func (o *SearchCompactNextCall) GetMethod() string`

GetMethod returns the Method field if non-nil, zero value otherwise.

### GetMethodOk

`func (o *SearchCompactNextCall) GetMethodOk() (*string, bool)`

GetMethodOk returns a tuple with the Method field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMethod

`func (o *SearchCompactNextCall) SetMethod(v string)`

SetMethod sets Method field to given value.


### GetPath

`func (o *SearchCompactNextCall) GetPath() string`

GetPath returns the Path field if non-nil, zero value otherwise.

### GetPathOk

`func (o *SearchCompactNextCall) GetPathOk() (*string, bool)`

GetPathOk returns a tuple with the Path field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPath

`func (o *SearchCompactNextCall) SetPath(v string)`

SetPath sets Path field to given value.


### GetBody

`func (o *SearchCompactNextCall) GetBody() map[string]interface{}`

GetBody returns the Body field if non-nil, zero value otherwise.

### GetBodyOk

`func (o *SearchCompactNextCall) GetBodyOk() (*map[string]interface{}, bool)`

GetBodyOk returns a tuple with the Body field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBody

`func (o *SearchCompactNextCall) SetBody(v map[string]interface{})`

SetBody sets Body field to given value.


### GetFill

`func (o *SearchCompactNextCall) GetFill() []string`

GetFill returns the Fill field if non-nil, zero value otherwise.

### GetFillOk

`func (o *SearchCompactNextCall) GetFillOk() (*[]string, bool)`

GetFillOk returns a tuple with the Fill field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFill

`func (o *SearchCompactNextCall) SetFill(v []string)`

SetFill sets Fill field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
