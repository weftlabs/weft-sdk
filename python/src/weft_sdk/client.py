"""Stable buyer-facing client over the generated Weft APIs."""

from __future__ import annotations

from types import TracebackType
from typing import Callable, TypeVar

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
from .generated.models.fetch_response import FetchResponse
from .generated.models.me_response import MeResponse
from .generated.models.purchase_list_response import PurchaseListResponse
from .generated.models.purchase_response import PurchaseResponse
from .generated.models.search_request import SearchRequest
from .generated.models.search_response import SearchResponse

T = TypeVar("T")


class Client:
    """Buyer application entrypoint.

    Generated APIs remain available under :mod:`weft_sdk.generated` for
    operations that this deliberately small façade does not wrap.
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://weft.network",
        api_client: ApiClient | None = None,
    ) -> None:
        key = api_key.strip()
        if not key:
            raise ValueError("api_key is required")

        configuration = Configuration(
            host=base_url.rstrip("/"),
            access_token=key,
        )
        self._api_client = api_client or ApiClient(configuration)
        self._account = AccountApi(self._api_client)
        self._balance = BalanceApi(self._api_client)
        self._search = SearchApi(self._api_client)
        self._fetch = FetchApi(self._api_client)
        self._purchases = PurchasesApi(self._api_client)

    def _call(self, operation: Callable[[], T]) -> T:
        try:
            return operation()
        except ApiException as error:
            raise normalize_api_exception(error) from error
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
            ) from error

    def me(self) -> MeResponse:
        return self._call(self._account.get_me)

    def balance(self) -> BalanceResponse:
        return self._call(self._balance.get_balance)

    def search(self, *, query: str, max_results: int | None = None) -> SearchResponse:
        # Pass None explicitly so the generated model default does not appear
        # on the wire when the caller omitted the optional field.
        request = SearchRequest(query=query, max_results=max_results)
        return self._call(lambda: self._search.search(request))

    def fetch(
        self,
        *,
        url: str,
        max_cost_usd: str,
        idempotency_key: str,
        method: str | None = None,
    ) -> FetchResponse:
        if not max_cost_usd.strip():
            raise ValueError("max_cost_usd is required")
        if not idempotency_key.strip():
            raise ValueError("idempotency_key is required")
        request = FetchRequest(
            url=url,
            max_cost_usd=max_cost_usd,
            method=None if method is None else method.upper(),
        )
        return self._call(lambda: self._fetch.fetch(request, idempotency_key=idempotency_key))

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
