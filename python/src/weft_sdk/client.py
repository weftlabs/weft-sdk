"""Stable buyer-facing client over the generated Weft APIs."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from types import TracebackType
from typing import Any, Callable, TypeVar
from uuid import UUID

from urllib3.exceptions import HTTPError as TransportError

from .error import WeftError, normalize_api_exception
from .generated.api.account_api import AccountApi
from .generated.api.balance_api import BalanceApi
from .generated.api.fetch_api import FetchApi
from .generated.api.purchases_api import PurchasesApi
from .generated.api.search_api import SearchApi
from .generated.api_client import ApiClient
from .generated.configuration import Configuration
from .generated.exceptions import ApiException
from .generated.models.balance_response import BalanceResponse
from .generated.models.fetch_request import FetchRequest
from .generated.models.fetch_request_body import FetchRequestBody
from .generated.models.fetch_response import FetchResponse
from .generated.models.me_response import MeResponse
from .generated.models.purchase_list_response import PurchaseListResponse
from .generated.models.purchase_response import PurchaseResponse
from .generated.models.search_filter_spec import SearchFilterSpec
from .generated.models.search_request import SearchRequest
from .generated.models.search_response import SearchResponse

T = TypeVar("T")


def _search_filters(value: Mapping[str, Any] | None) -> SearchFilterSpec | None:
    if value is None:
        return None
    payload = dict(value)
    # The generated model defaults this flag to false. None keeps an omitted
    # flag off the wire, matching a caller who did not set it.
    payload.setdefault("include_unknown_prices", None)
    return SearchFilterSpec.model_validate(payload)


def _json_null_non_finite(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, Mapping):
        return {key: _json_null_non_finite(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_null_non_finite(item) for item in value]
    return value


def _fetch_body(
    value: str | Mapping[str, Any] | list[Any] | None,
) -> FetchRequestBody | None:
    if value is None:
        return None
    # Generated FetchRequestBodyToJSON replaces an object body with {}.
    # json.dumps matches JSON.stringify, including NaN and Infinity as null.
    # The server accepts that string.
    if not isinstance(value, str):
        value = json.dumps(
            _json_null_non_finite(value),
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    return FetchRequestBody(actual_instance=value)


class Client:
    """Buyer application entrypoint.

    Generated APIs remain available under :mod:`weft_sdk.generated` for
    operations that this deliberately small façade does not wrap.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        access_token: str | None = None,
        base_url: str = "https://weft.network",
        api_client: ApiClient | None = None,
    ) -> None:
        if api_key is not None and access_token is not None:
            raise ValueError("api_key and access_token are mutually exclusive")
        raw = api_key if api_key is not None else access_token
        credential = raw.strip() if isinstance(raw, str) else ""
        if not credential:
            if api_key is not None:
                raise ValueError("api_key is required")
            if access_token is not None:
                raise ValueError("access_token is required")
            raise ValueError("api_key or access_token is required")

        configuration = Configuration(
            host=base_url.rstrip("/"),
            access_token=credential,
        )
        self._api_client = api_client or ApiClient(configuration)
        self._account = AccountApi(self._api_client)
        self._balance = BalanceApi(self._api_client)
        self._search = SearchApi(self._api_client)
        self._fetch = FetchApi(self._api_client)
        self._purchases = PurchasesApi(self._api_client)

    def _call(self, operation: Callable[[], T], *, paid: bool = False) -> T:
        try:
            return operation()
        except ApiException as error:
            raise normalize_api_exception(error, paid=paid) from error
        except TransportError as error:
            # No HTTP response exists, so the outcome is uncertain. Callers
            # retry with backoff and, for paid fetch, reuse the same
            # idempotency key.
            raise WeftError(
                status=0,
                code="NETWORK_ERROR",
                message=f"Network failure before a Weft API response: {error}",
                request_id=None,
                retryable=True,
                details=None,
                charge="possible" if paid else "none",
            ) from error
        except WeftError:
            raise
        except Exception as error:
            if not paid:
                raise
            # Weft answered 2xx, so the fetch most likely paid, but the body
            # did not decode.
            raise WeftError(
                status=0,
                code="RESPONSE_DECODE_ERROR",
                message="Weft API returned a fetch response that could not be decoded",
                request_id=None,
                retryable=True,
                details=None,
                charge="possible",
            ) from error

    def me(self) -> MeResponse:
        return self._call(self._account.get_me)

    def balance(self) -> BalanceResponse:
        return self._call(self._balance.get_balance)

    def search(
        self,
        *,
        query: str,
        max_results: int | None = None,
        filters: Mapping[str, Any] | None = None,
    ) -> SearchResponse:
        # Pass None explicitly so a generated model default does not appear
        # on the wire when the caller omitted the optional field.
        request = SearchRequest(
            query=query,
            max_results=max_results,
            filters=_search_filters(filters),
        )
        return self._call(lambda: self._search.search(request))

    def fetch(
        self,
        *,
        url: str,
        max_cost_usd: str,
        idempotency_key: str,
        method: str | None = None,
        body: str | Mapping[str, Any] | list[Any] | None = None,
        headers: Mapping[str, str] | None = None,
        search_id: str | None = None,
        operation_id: str | None = None,
        access_method_id: str | None = None,
    ) -> FetchResponse:
        if not max_cost_usd.strip():
            raise ValueError("max_cost_usd is required")
        if not idempotency_key.strip():
            raise ValueError("idempotency_key is required")
        request_fields: dict[str, Any] = {
            "url": url,
            "max_cost_usd": max_cost_usd,
            "method": None if method is None else method.upper(),
        }
        # An explicit None is a set field. The generated serializer then emits
        # body: null. Omit the argument so an unset body stays off the wire.
        if body is not None:
            request_fields["body"] = _fetch_body(body)
        if headers is not None:
            request_fields["headers"] = dict(headers)
        if search_id is not None:
            # A value that is not a well-formed handle is ignored, not rejected.
            try:
                request_fields["search_id"] = UUID(search_id)
            except ValueError:
                pass
        if operation_id is not None:
            request_fields["operation_id"] = operation_id
        if access_method_id is not None:
            request_fields["access_method_id"] = access_method_id
        request = FetchRequest(**request_fields)
        return self._call(
            lambda: self._fetch.fetch(request, idempotency_key=idempotency_key), paid=True
        )

    def purchases(
        self, *, page: int | None = None, per_page: int | None = None
    ) -> PurchaseListResponse:
        return self._call(lambda: self._purchases.list_purchases(page=page, per_page=per_page))

    def purchase(self, purchase_id: int) -> PurchaseResponse:
        return self._call(lambda: self._purchases.get_purchase(purchase_id))

    def close(self) -> None:
        """Release client resources when the generated transport supports it."""

    def __enter__(self) -> Client:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()
