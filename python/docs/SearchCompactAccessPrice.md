# SearchCompactAccessPrice


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**kind** | **str** | Price kind, such as &#x60;fixed&#x60;, &#x60;dynamic&#x60;, &#x60;free&#x60; or &#x60;unknown&#x60;. | [optional]
**indexed_usd** | **str** | Indexed USD price. A &#x60;dynamic&#x60; price is not a cap. | [optional]
**unit** | **str** |  | [optional]
**hint** | **str** |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_compact_access_price import SearchCompactAccessPrice

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactAccessPrice from a JSON string
search_compact_access_price_instance = SearchCompactAccessPrice.from_json(json)
# print the JSON string representation of the object
print(SearchCompactAccessPrice.to_json())

# convert the object into a dict
search_compact_access_price_dict = search_compact_access_price_instance.to_dict()
# create an instance of SearchCompactAccessPrice from a dict
search_compact_access_price_from_dict = SearchCompactAccessPrice.from_dict(search_compact_access_price_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
