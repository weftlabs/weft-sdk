def test_generated_client_imports_cleanly():
    import weft_sdk.generated

    assert weft_sdk.generated.Configuration


def test_generated_buyer_models_accept_contract_nulls():
    from weft_sdk.generated.models.purchase import Purchase
    from weft_sdk.generated.models.user_principal import UserPrincipal

    purchase = Purchase.from_dict(
        {
            "id": 1,
            "status": "rejected",
            "amount_usd": "0.030000",
            "recipient_address": "0xMerchant",
            "network": "base_sepolia",
            "protocol": None,
            "context": None,
            "attribution_status": "unattributed",
            "tx_hash": None,
            "reject_reason": "insufficient_balance",
            "failure_reason": None,
            "idempotency_key": None,
            "signed_at": "2026-07-30T00:00:00Z",
            "settled_at": None,
            "artifact": None,
        }
    )
    principal = UserPrincipal.from_dict(
        {
            "principal_type": "user",
            "id": 1,
            "email": "agent@example.com",
            "status": "active",
            "buyer_enabled": True,
            "seller_enabled": False,
            "provisioning_status": "pending",
            "wallet": None,
        }
    )

    assert purchase.artifact is None
    assert purchase.settled_at is None
    assert principal.wallet is None
