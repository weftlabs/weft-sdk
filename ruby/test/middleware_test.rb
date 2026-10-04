require 'minitest/autorun'
require_relative '../lib/weft/facilitator/middleware'

class MiddlewareTest < Minitest::Test
  def test_passthrough_when_no_routes
    inner_app = ->(_env) { [200, { 'Content-Type' => 'text/plain' }, ['OK']] }
    middleware = Weft::Facilitator::RackMiddleware.new(
      inner_app,
      sync_facilitator_on_start: false,
      schemes: [scheme]
    )

    status, _, body = middleware.call(rack_env('/hello'))

    assert_equal 200, status
    assert_equal ['OK'], body
  end

  def test_passthrough_when_route_not_matched
    inner_app = ->(_env) { [200, {}, ['OK']] }
    middleware = Weft::Facilitator::RackMiddleware.new(
      inner_app,
      routes: {
        'GET /paid' => {
          'accepts' => { 'scheme' => 'exact', 'network' => 'eip155:84532', 'payTo' => '0xabc', 'price' => '$0.01' }
        }
      },
      sync_facilitator_on_start: false,
      schemes: [scheme]
    )

    status, _, body = middleware.call(rack_env('/free'))

    assert_equal 200, status
    assert_equal ['OK'], body
  end

  def test_method_mismatch_is_not_protected
    inner_app = ->(_env) { [200, {}, ['OK']] }
    middleware = Weft::Facilitator::RackMiddleware.new(
      inner_app,
      routes: {
        'POST /paid' => {
          'accepts' => { 'scheme' => 'exact', 'network' => 'eip155:84532', 'payTo' => '0xabc', 'price' => '$0.01' }
        }
      },
      sync_facilitator_on_start: false,
      schemes: [scheme]
    )

    status, = middleware.call(rack_env('/paid', method: 'GET'))
    assert_equal 200, status
  end

  private

  def scheme
    {
      'network' => 'eip155:84532',
      'server' => {
        'scheme' => 'exact',
        'defaultAssetTransferMethod' => 'authorization',
        'paymentFlows' => {
          'authorization' => { 'supported' => ['authorization'], 'default' => 'authorization' }
        }
      }
    }
  end

  def rack_env(path, method: 'GET')
    {
      'REQUEST_METHOD' => method,
      'PATH_INFO' => path,
      'HTTP_HOST' => 'localhost',
      'rack.url_scheme' => 'https'
    }
  end
end
