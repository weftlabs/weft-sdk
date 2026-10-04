# frozen_string_literal: true

require 'base64'
require 'json'
require 'minitest/autorun'
require 'socket'
require 'stringio'

require_relative '../lib/weft/sdk'

class FacilitatorIntegrationTest < Minitest::Test
  NETWORK = 'eip155:84532'
  PAY_TO = '0x0000000000000000000000000000000000000001'
  ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  SECRET = 'wk live secret'

  def setup
    @requests = []
    @settle_mode = :ok
    @server = TCPServer.new('127.0.0.1', 0)
    @port = @server.addr[1]
    @accept = Thread.new { accept_loop }
  end

  def teardown
    @server.close
    @accept.join(2)
  end

  def test_unpaid_paid_failure_and_facilitator_down
    handler_runs = 0
    app = lambda do |env|
      handler_runs += 1
      status = env['PATH_INFO'] == '/fail' ? 500 : 200
      [status, { 'Content-Type' => 'application/json' }, ['{"ok":true}']]
    end
    middleware = build_middleware(app, api_key: 'wk_live_abc')

    unpaid = middleware.call(rack_env('/v1/search'))
    assert_equal 402, unpaid[0]
    assert_equal 'application/json', unpaid[1]['Content-Type']
    assert_equal 'no-store', unpaid[1]['Cache-Control']
    assert_equal ['{}'], unpaid[2]
    challenge = decode_required(unpaid[1]['PAYMENT-REQUIRED'])
    assert_equal expected_challenge, challenge
    assert_equal unpaid[1]['PAYMENT-REQUIRED'],
                 Base64.strict_encode64(JSON.generate(expected_challenge))
    assert challenge['extensions'].key?('weft.product')
    assert challenge['extensions'].key?('weft.request')
    assert_equal 1, @requests.count { |item| item[:path] == '/supported' }
    refute @requests.any? { |item| item[:path] == '/verify' }

    paid = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))
    assert_equal 200, paid[0]
    assert_equal 1, handler_runs
    verify = @requests.find { |item| item[:path] == '/verify' }
    settle = @requests.find { |item| item[:path] == '/settle' }
    refute_nil verify
    refute_nil settle
    assert_equal 'wk_live_abc', verify[:headers]['x-api-key']
    assert_equal 'wk_live_abc', settle[:headers]['x-api-key']
    assert_equal 'GET', settle[:json]['paymentPayload']['httpMethod']
    refute verify[:json]['paymentPayload'].key?('httpMethod')
    decoded = JSON.parse(Base64.strict_decode64(paid[1]['PAYMENT-RESPONSE']))
    assert_equal true, decoded['success']
    assert_equal '0xabc', decoded['transaction']

    before = @requests.count { |item| item[:path] == '/settle' }
    failed = middleware.call(rack_env('/fail', payment: payment_header(challenge, '/fail')))
    assert_equal 500, failed[0]
    assert_equal before, @requests.count { |item| item[:path] == '/settle' }
    assert_nil failed[1]['PAYMENT-RESPONSE']

    @settle_mode = :down
    down = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))
    assert_equal 503, down[0]
    assert_equal '1', down[1]['retry-after']
    assert_equal 'private', down[1]['cache-control']
    assert_nil down[1]['PAYMENT-RESPONSE']
    assert_equal({ 'error' => 'facilitator_unavailable' }, JSON.parse(down[2].first))
  end

  def test_malformed_key_sends_no_auth_and_does_not_log_the_key
    warnings = capture_warnings do
      middleware = build_middleware(->(_) { [200, {}, ['ok']] }, api_key: SECRET)
      middleware.call(rack_env('/v1/search'))
    end
    supported = @requests.find { |item| item[:path] == '/supported' }
    refute_nil supported
    assert_equal "weft-sdk-rack/#{Weft::SDK::VERSION}", supported[:headers]['user-agent']
    assert_nil supported[:headers]['authorization']
    assert_nil supported[:headers]['x-api-key']
    assert_equal 1, warnings.count { |line| line.include?('[weft] ignoring apiKey') }
    refute warnings.any? { |line| line.include?(SECRET) }
  end

  private

  def build_middleware(app, api_key:)
    routes = {
      'GET /v1/search' => {
        'accepts' => {
          'scheme' => 'exact',
          'network' => NETWORK,
          'payTo' => PAY_TO,
          'price' => '$0.01'
        },
        'extensions' => {
          'weft.request' => ->(_request) { { 'model' => 'gpt', 'max_tokens' => 16 } }
        }
      },
      'GET /fail' => {
        'accepts' => {
          'scheme' => 'exact',
          'network' => NETWORK,
          'payTo' => PAY_TO,
          'price' => '$0.01'
        }
      }
    }
    Weft::Facilitator::RackMiddleware.new(
      app,
      routes: routes,
      api_key: api_key,
      name: 'Acme Pricing API',
      type: 'api',
      tags: ['finance'],
      icon_url: 'https://acme.test/icon.png',
      product_id: 'prod_1',
      facilitator_url: "http://127.0.0.1:#{@port}",
      schemes: [{ 'network' => NETWORK, 'server' => scheme }]
    )
  end

  def scheme
    {
      'scheme' => 'exact',
      'defaultAssetTransferMethod' => 'authorization',
      'paymentFlows' => {
        'authorization' => { 'supported' => ['authorization'], 'default' => 'authorization' }
      },
      'parsePrice' => ->(_price, _network) { { 'amount' => '10000', 'asset' => ASSET } },
      'enhancePaymentRequirements' => ->(requirements, _kind, _extensions) { requirements }
    }
  end

  def expected_challenge
    {
      'x402Version' => 2,
      'error' => 'Payment required',
      'resource' => {
        'url' => 'https://api.acme.test/v1/search',
        'description' => '',
        'mimeType' => '',
        'serviceName' => 'Acme Pricing API',
        'tags' => ['weft:type:api', 'finance'],
        'iconUrl' => 'https://acme.test/icon.png'
      },
      'accepts' => [
        {
          'scheme' => 'exact',
          'network' => NETWORK,
          'amount' => '10000',
          'asset' => ASSET,
          'payTo' => PAY_TO,
          'maxTimeoutSeconds' => 300,
          'extra' => {}
        }
      ],
      'extensions' => {
        'weft.request' => {
          'info' => { 'model' => 'gpt', 'max_tokens' => 16 },
          'schema' => Weft::Facilitator::WEFT_REQUEST_INFO_SCHEMA
        },
        'weft.product' => {
          'info' => { 'kind' => 'api', 'product_id' => 'prod_1' },
          'schema' => Weft::Facilitator::Product::WEFT_PRODUCT_INFO_SCHEMA
        }
      }
    }
  end

  def payment_header(challenge, path = '/v1/search')
    payload = {
      'x402Version' => 2,
      'payload' => {},
      'accepted' => challenge['accepts'].first.merge(
        'resource' => "https://api.acme.test#{path}"
      )
    }
    # accepted must match the advertised requirement exactly, including extra.
    payload['accepted'] = challenge['accepts'].first
    Base64.strict_encode64(JSON.generate(payload))
  end

  def decode_required(header)
    JSON.parse(Base64.strict_decode64(header))
  end

  def rack_env(path, payment: nil)
    env = {
      'REQUEST_METHOD' => 'GET',
      'PATH_INFO' => path,
      'HTTP_HOST' => 'api.acme.test',
      'rack.url_scheme' => 'https',
      'HTTP_ACCEPT' => 'application/json'
    }
    env['HTTP_PAYMENT_SIGNATURE'] = payment if payment
    env
  end

  def capture_warnings
    previous = $stderr
    $stderr = StringIO.new
    yield
    $stderr.string.lines.map(&:chomp)
  ensure
    $stderr = previous
  end

  def accept_loop
    loop do
      socket = @server.accept
      Thread.new { handle(socket) }
    end
  rescue IOError, Errno::EBADF
    nil
  end

  def handle(socket)
    head, rest = read_head(socket)
    lines = head.split("\r\n")
    request_line = lines.shift.to_s
    method, path, = request_line.split(' ')
    headers = {}
    lines.each do |line|
      name, value = line.split(':', 2)
      headers[name.downcase] = value.strip
    end
    length = headers['content-length'].to_i
    body = rest.to_s
    while body.bytesize < length
      body << socket.readpartial(length - body.bytesize)
    end
    @requests << {
      method: method,
      path: path,
      headers: headers,
      body: body,
      json: body.empty? ? nil : JSON.parse(body)
    }
    respond(socket, path)
  rescue StandardError
    socket.close
  end

  def read_head(socket)
    buffer = +''
    until buffer.include?("\r\n\r\n")
      buffer << socket.readpartial(4096)
    end
    buffer.split("\r\n\r\n", 2)
  end

  def respond(socket, path)
    status, payload = case path
                      when '/supported'
                        [200, { 'kinds' => [{ 'x402Version' => 2, 'scheme' => 'exact', 'network' => NETWORK }],
                                'extensions' => [], 'signers' => {} }]
                      when '/verify'
                        [200, { 'isValid' => true }]
                      when '/settle'
                        if @settle_mode == :down
                          [503, {
                            'success' => false,
                            'errorReason' => 'temporarily_unavailable',
                            'errorMessage' => 'down',
                            'payer' => '',
                            'transaction' => '',
                            'network' => NETWORK
                          }]
                        else
                          [200, {
                            'success' => true,
                            'transaction' => '0xabc',
                            'network' => NETWORK,
                            'payer' => '0xpayer'
                          }]
                        end
                      else
                        [404, { 'error' => 'missing' }]
                      end
    raw = JSON.generate(payload)
    reason = status == 200 ? 'OK' : 'Error'
    socket.write(
      "HTTP/1.1 #{status} #{reason}\r\n" \
      "Content-Type: application/json\r\n" \
      "Content-Length: #{raw.bytesize}\r\n" \
      "Connection: close\r\n\r\n" \
      "#{raw}"
    )
  ensure
    socket.close
  end
end
