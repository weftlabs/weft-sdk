# SearchEndpointCallInputSchema

The request JSON Schema, including boolean true/false schemas. Reviewed versioned contracts preserve the provider schema and apply separately authored client scope constraints in this projection. Null when no body schema is declared; query/path/header/cookie bindings remain in the full contract. Retrieve contract_url before constructing requests for versioned contracts.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------

## Example

```python
from weft_sdk.generated.models.search_endpoint_call_input_schema import SearchEndpointCallInputSchema

# TODO update the JSON string below
json = "{}"
# create an instance of SearchEndpointCallInputSchema from a JSON string
search_endpoint_call_input_schema_instance = SearchEndpointCallInputSchema.from_json(json)
# print the JSON string representation of the object
print(SearchEndpointCallInputSchema.to_json())

# convert the object into a dict
search_endpoint_call_input_schema_dict = search_endpoint_call_input_schema_instance.to_dict()
# create an instance of SearchEndpointCallInputSchema from a dict
search_endpoint_call_input_schema_from_dict = SearchEndpointCallInputSchema.from_dict(search_endpoint_call_input_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
