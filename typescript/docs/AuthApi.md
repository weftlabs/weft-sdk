# AuthApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**confirmAccount**](AuthApi.md#confirmaccount) | **POST** /api/v1/auth/confirm | Confirm an account |
| [**requestPasswordReset**](AuthApi.md#requestpasswordreset) | **POST** /api/v1/auth/password/reset | Request password reset |
| [**resendConfirmation**](AuthApi.md#resendconfirmationoperation) | **POST** /api/v1/auth/resend-confirmation | Resend confirmation email |
| [**signIn**](AuthApi.md#signinoperation) | **POST** /api/v1/auth/sign_in | Sign in with email and password |
| [**signUp**](AuthApi.md#signupoperation) | **POST** /api/v1/auth/sign_up | Create an account |
| [**updatePassword**](AuthApi.md#updatepassword) | **POST** /api/v1/auth/password/update | Update password with reset token |



## confirmAccount

> AuthResponse confirmAccount(confirmRequest)

Confirm an account

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { ConfirmAccountRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // ConfirmRequest
    confirmRequest: ...,
  } satisfies ConfirmAccountRequest;

  try {
    const data = await api.confirmAccount(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **confirmRequest** | [ConfirmRequest](ConfirmRequest.md) |  | |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Account confirmed |  -  |
| **422** | Invalid token |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## requestPasswordReset

> MessageResponse requestPasswordReset(passwordResetRequest)

Request password reset

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { RequestPasswordResetRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // PasswordResetRequest
    passwordResetRequest: ...,
  } satisfies RequestPasswordResetRequest;

  try {
    const data = await api.requestPasswordReset(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **passwordResetRequest** | [PasswordResetRequest](PasswordResetRequest.md) |  | |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Reset email sent |  -  |
| **413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## resendConfirmation

> MessageResponse resendConfirmation(resendConfirmationRequest)

Resend confirmation email

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { ResendConfirmationOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // ResendConfirmationRequest
    resendConfirmationRequest: ...,
  } satisfies ResendConfirmationOperationRequest;

  try {
    const data = await api.resendConfirmation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **resendConfirmationRequest** | [ResendConfirmationRequest](ResendConfirmationRequest.md) |  | |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Confirmation sent |  -  |
| **413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## signIn

> AuthResponse signIn(signInRequest)

Sign in with email and password

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { SignInOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // SignInRequest
    signInRequest: ...,
  } satisfies SignInOperationRequest;

  try {
    const data = await api.signIn(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **signInRequest** | [SignInRequest](SignInRequest.md) |  | |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Signed in |  -  |
| **401** | Invalid credentials |  -  |
| **413** | Request body exceeds the 4 KiB limit |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## signUp

> AuthResponse signUp(signUpRequest)

Create an account

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { SignUpOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // SignUpRequest
    signUpRequest: ...,
  } satisfies SignUpOperationRequest;

  try {
    const data = await api.signUp(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **signUpRequest** | [SignUpRequest](SignUpRequest.md) |  | |

### Return type

[**AuthResponse**](AuthResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Account created |  -  |
| **422** | Validation error |  -  |
| **429** | Rate limit exceeded (20 accounts/hour/IP) |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updatePassword

> MessageResponse updatePassword(passwordUpdateRequest)

Update password with reset token

### Example

```ts
import {
  Configuration,
  AuthApi,
} from '@weftlabs/sdk';
import type { UpdatePasswordRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const api = new AuthApi();

  const body = {
    // PasswordUpdateRequest
    passwordUpdateRequest: ...,
  } satisfies UpdatePasswordRequest;

  try {
    const data = await api.updatePassword(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **passwordUpdateRequest** | [PasswordUpdateRequest](PasswordUpdateRequest.md) |  | |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Password updated |  -  |
| **422** | Invalid or expired reset token |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
