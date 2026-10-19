# SearchCompactResultOperation

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | **string** | Catalog operation id. Send it as &#x60;operation_id&#x60; to &#x60;POST /api/v1/fetch&#x60;. |
**Name** | Pointer to **string** |  | [optional]
**Description** | Pointer to **string** |  | [optional]

## Methods

### NewSearchCompactResultOperation

`func NewSearchCompactResultOperation(id string, ) *SearchCompactResultOperation`

NewSearchCompactResultOperation instantiates a new SearchCompactResultOperation object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewSearchCompactResultOperationWithDefaults

`func NewSearchCompactResultOperationWithDefaults() *SearchCompactResultOperation`

NewSearchCompactResultOperationWithDefaults instantiates a new SearchCompactResultOperation object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *SearchCompactResultOperation) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *SearchCompactResultOperation) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *SearchCompactResultOperation) SetId(v string)`

SetId sets Id field to given value.


### GetName

`func (o *SearchCompactResultOperation) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *SearchCompactResultOperation) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *SearchCompactResultOperation) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *SearchCompactResultOperation) HasName() bool`

HasName returns a boolean if a field has been set.

### GetDescription

`func (o *SearchCompactResultOperation) GetDescription() string`

GetDescription returns the Description field if non-nil, zero value otherwise.

### GetDescriptionOk

`func (o *SearchCompactResultOperation) GetDescriptionOk() (*string, bool)`

GetDescriptionOk returns a tuple with the Description field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDescription

`func (o *SearchCompactResultOperation) SetDescription(v string)`

SetDescription sets Description field to given value.

### HasDescription

`func (o *SearchCompactResultOperation) HasDescription() bool`

HasDescription returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
