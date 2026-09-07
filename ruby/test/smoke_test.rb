require 'minitest/autorun'
require 'weft/sdk'

class SmokeTest < Minitest::Test
  def test_generated_client_loads
    assert_equal Weft::SDK::VERSION, Weft::VERSION
    assert Weft::ApiClient
    assert_kind_of Hash, Weft::AccountDetails.allocate.to_hash
  end

  def test_me_discriminator_accepts_json_string_keys
    principal = Weft::MeResponseData.build(
      'principal_type' => 'user',
      'id' => 1,
      'email' => 'agent@example.com',
      'status' => 'active',
      'buyer_enabled' => true,
      'seller_enabled' => false,
      'provisioning_status' => 'pending',
      'wallet' => nil
    )

    assert_instance_of Weft::UserPrincipal, principal
    assert_nil principal.wallet
  end

  def test_siwx_response_preserves_null_receipt_fields
    [42, nil].each do |artifact_id|
      receipt = {
        status: 200, headers: { 'content-type' => 'application/json' },
        body_base64: 'e30=', paid_usd: '0.00', held_usd: nil,
        payment_status: 'not_required', tx_hash: nil, protocol: 'x402',
        artifact_id: artifact_id
      }
      response = Struct.new(:body, :headers).new(JSON.generate(receipt), {})
      result = Weft::ApiClient.new.deserialize(response, 'FetchResponse')

      assert_equal 'not_required', result.payment_status
      assert_equal '0.00', result.paid_usd
      assert_nil result.held_usd
      assert_nil result.tx_hash
      assert_equal receipt, result.to_hash
    end
  end

end
