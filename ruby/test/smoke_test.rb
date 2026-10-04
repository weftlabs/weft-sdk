require 'minitest/autorun'
require 'weft/sdk'
require 'yaml'

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

  def test_bounded_fetch_constraint_survives_go_schema_generation
    types = { 'allow_tempo_refill' => 'boolean', 'max_total_cost_usd' => 'string' }

    ['spec/openapi.yaml', 'go/generated/api/openapi.yaml'].each do |path|
      # The generated spec contains unquoted timestamp examples.
      schema = YAML.safe_load_file(File.expand_path("../../#{path}", __dir__), permitted_classes: [Time])
      request = schema.fetch('components').fetch('schemas').fetch('FetchRequest')
      constraint = request.fetch('not')
      if constraint.key?('$ref')
        reference = constraint.fetch('$ref')
        assert reference.start_with?('#/'), "#{path}: expected a local not reference"
        constraint = reference.delete_prefix('#/').split('/').reduce(schema) do |node, key|
          node.fetch(key.gsub('~1', '/').gsub('~0', '~'))
        end
      else
        assert_equal 'object', constraint.fetch('type'), path
        types.each do |name, type|
          assert_equal type, constraint.fetch('properties').fetch(name).fetch('type'), path
        end
      end

      # Losing max_total_cost_usd here wrongly forbids refill=true on its own.
      assert_equal types.keys.sort, constraint.fetch('required').sort, path
      assert_equal types.keys.sort, constraint.fetch('properties').keys.sort, path
      assert_equal [true], constraint.fetch('properties').fetch('allow_tempo_refill').fetch('enum'), path

      # Go omits redundant types in `not`; the enclosing request still enforces them.
      types.each do |name, type|
        property = request.fetch('properties').fetch(name)
        assert_equal type, property.fetch('type'), path
        refute property.key?('default'), "#{path}: #{name} must remain opt-in"
        refute_includes request.fetch('required'), name, path
      end
    end
  end

  def test_bounded_fetch_request_serializes_false_decimals_and_omission
    client = Weft::ApiClient.new
    legacy = { url: 'https://merchant.example/data', max_cost_usd: '0.050000' }
    [
      {},
      { allow_tempo_refill: true },
      { allow_tempo_refill: false },
      { max_total_cost_usd: '0.050000' },
      { allow_tempo_refill: false, max_total_cost_usd: '0.000001' }
    ].each do |controls|
      request = Weft::FetchRequest.new(legacy.merge(controls))
      wire = JSON.parse(client.object_to_http_body(request))

      assert_equal legacy.merge(method: 'GET').merge(controls).transform_keys(&:to_s), wire
    end
  end

end
