# weft_sdk.generated.AuthApi

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**confirm_account**](AuthApi.md#confirm_account) | **POST** /api/v1/auth/confirm | Confirm an account
[**request_password_reset**](AuthApi.md#request_password_reset) | **POST** /api/v1/auth/password/reset | Request password reset
[**resend_confirmation**](AuthApi.md#resend_confirmation) | **POST** /api/v1/auth/resend-confirmation | Resend confirmation email
[**sign_in**](AuthApi.md#sign_in) | **POST** /api/v1/auth/sign_in | Sign in with email and password
[**sign_up**](AuthApi.md#sign_up) | **POST** /api/v1/auth/sign_up | Create an account
[**update_password**](AuthApi.md#update_password) | **POST** /api/v1/auth/password/update | Update password with reset token


# **confirm_account**
> AuthResponse confirm_account(confirm_request)

Confirm an account

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.auth_response import AuthResponse
from weft_sdk.generated.models.confirm_request import ConfirmRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    confirm_request = weft_sdk.generated.ConfirmRequest() # ConfirmRequest |

    try:
        # Confirm an account
        api_response = api_instance.confirm_account(confirm_request)
        print("The response of AuthApi->confirm_account:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->confirm_account: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **confirm_request** | [**ConfirmRequest**](ConfirmRequest.md)|  |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Account confirmed |  -  |
**422** | Invalid token |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **request_password_reset**
> MessageResponse request_password_reset(password_reset_request)

Request password reset

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.message_response import MessageResponse
from weft_sdk.generated.models.password_reset_request import PasswordResetRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    password_reset_request = weft_sdk.generated.PasswordResetRequest() # PasswordResetRequest |

    try:
        # Request password reset
        api_response = api_instance.request_password_reset(password_reset_request)
        print("The response of AuthApi->request_password_reset:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->request_password_reset: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **password_reset_request** | [**PasswordResetRequest**](PasswordResetRequest.md)|  |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Reset email sent |  -  |
**413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **resend_confirmation**
> MessageResponse resend_confirmation(resend_confirmation_request)

Resend confirmation email

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.message_response import MessageResponse
from weft_sdk.generated.models.resend_confirmation_request import ResendConfirmationRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    resend_confirmation_request = weft_sdk.generated.ResendConfirmationRequest() # ResendConfirmationRequest |

    try:
        # Resend confirmation email
        api_response = api_instance.resend_confirmation(resend_confirmation_request)
        print("The response of AuthApi->resend_confirmation:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->resend_confirmation: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **resend_confirmation_request** | [**ResendConfirmationRequest**](ResendConfirmationRequest.md)|  |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Confirmation sent |  -  |
**413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **sign_in**
> AuthResponse sign_in(sign_in_request)

Sign in with email and password

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.auth_response import AuthResponse
from weft_sdk.generated.models.sign_in_request import SignInRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    sign_in_request = weft_sdk.generated.SignInRequest() # SignInRequest |

    try:
        # Sign in with email and password
        api_response = api_instance.sign_in(sign_in_request)
        print("The response of AuthApi->sign_in:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->sign_in: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **sign_in_request** | [**SignInRequest**](SignInRequest.md)|  |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Signed in |  -  |
**401** | Invalid credentials |  -  |
**413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **sign_up**
> AuthResponse sign_up(sign_up_request)

Create an account

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.auth_response import AuthResponse
from weft_sdk.generated.models.sign_up_request import SignUpRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    sign_up_request = weft_sdk.generated.SignUpRequest() # SignUpRequest |

    try:
        # Create an account
        api_response = api_instance.sign_up(sign_up_request)
        print("The response of AuthApi->sign_up:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->sign_up: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **sign_up_request** | [**SignUpRequest**](SignUpRequest.md)|  |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Account created |  -  |
**422** | Validation error |  -  |
**429** | Rate limit exceeded (20 accounts/hour/IP) |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **update_password**
> MessageResponse update_password(password_update_request)

Update password with reset token

### Example


```python
import weft_sdk.generated
from weft_sdk.generated.models.message_response import MessageResponse
from weft_sdk.generated.models.password_update_request import PasswordUpdateRequest
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)


# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.AuthApi(api_client)
    password_update_request = weft_sdk.generated.PasswordUpdateRequest() # PasswordUpdateRequest |

    try:
        # Update password with reset token
        api_response = api_instance.update_password(password_update_request)
        print("The response of AuthApi->update_password:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AuthApi->update_password: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **password_update_request** | [**PasswordUpdateRequest**](PasswordUpdateRequest.md)|  |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Password updated |  -  |
**422** | Invalid or expired reset token |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
