# frozen_string_literal: true

require 'base64'
require 'json'
require 'minitest/autorun'
require 'socket'

require_relative '../lib/weft/sdk'

class FacilitatorReviewTest < Minitest::Test
  NETWORK = 'eip155:84532'
  PAY_TO = '0x0000000000000000000000000000000000000001'
  ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

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

  def test_unresolvable_dollar_override_does_not_settle
    runs = 0
    app = lambda do |_env|
      runs += 1
      [200, { 'Content-Type' => 'application/json', 'Settlement-Overrides' => '{"amount":"$0.50"}' }, ['{"ok":true}']]
    end
    middleware = build(app, scheme: scheme_without_decimals)
    challenge = unpaid_challenge(middleware)
    response = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))

    assert_equal 1, runs
    assert_equal 402, response[0]
    assert_equal 0, @requests.count { |item| item[:path] == '/settle' }
    refute_equal ['{"ok":true}'], response[2]
    decoded = JSON.parse(Base64.strict_decode64(response[1]['PAYMENT-RESPONSE']))
    refute decoded['success']
  end

  def test_malformed_override_json_is_ignored
    app = lambda do |_env|
      [200, { 'Content-Type' => 'application/json', 'Settlement-Overrides' => '{not-json' }, ['{"ok":true}']]
    end
    middleware = build(app, scheme: scheme_without_decimals)
    challenge = unpaid_challenge(middleware)
    response = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))

    assert_equal 200, response[0]
    settle = @requests.select { |item| item[:path] == '/settle' }
    assert_equal 1, settle.length
    assert_equal '10000', settle.first[:json]['paymentRequirements']['amount']
  end

  def test_non_object_settlement_overrides_are_ignored
    raws = ['[]', 'null', '5']
    index = 0
    app = lambda do |_env|
      raw = raws[index]
      index += 1
      [200, { 'Content-Type' => 'application/json', 'Settlement-Overrides' => raw }, ['{"ok":true}']]
    end
    middleware = build(app, scheme: scheme_without_decimals)
    challenge = unpaid_challenge(middleware)
    raws.each do |raw|
      before = @requests.count { |item| item[:path] == '/settle' }
      response = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))
      assert_equal 200, response[0], raw
      settles = @requests.select { |item| item[:path] == '/settle' }
      assert_equal before + 1, settles.length, raw
      assert_equal '10000', settles.last[:json]['paymentRequirements']['amount'], raw
    end
  end

  def test_invalid_utf8_percent_escape_keeps_the_segment
    assert_equal '/files/%FF', Weft::Facilitator::X402.normalize_path('/files/%FF')
    assert_equal '/files/%C3%28', Weft::Facilitator::X402.normalize_path('/files/%C3%28')
    assert_equal true, Weft::Facilitator::X402.route_matches?('/files/:id', 'GET', '/files/%FF')
    assert_equal true, Weft::Facilitator::X402.route_matches?('/files/%FF', 'GET', '/files/%FF')
    assert_equal '/files/€', Weft::Facilitator::X402.normalize_path('/files/%E2%82%AC')
  end

  def test_nested_extra_subset_matches_when_the_buyer_adds_a_key
    middleware = Weft::Facilitator::RackMiddleware.allocate
    assert middleware.send(
      :extra_subset?,
      { 'nested' => { 'mode' => 'x' } },
      { 'nested' => { 'mode' => 'x', 'extra' => 'buyer' } }
    )
    refute middleware.send(
      :extra_subset?,
      { 'nested' => { 'mode' => 'x' } },
      { 'nested' => { 'mode' => 'y' } }
    )
    assert middleware.send(:extra_subset?, { 'a' => 1 }, { 'a' => 1, 'b' => 2 })
  end

  def test_extension_echo_mismatch_rejects_before_verify
    runs = 0
    app = lambda do |_env|
      runs += 1
      [200, { 'Content-Type' => 'application/json' }, ['{"ok":true}']]
    end
    middleware = build(app, scheme: priced_scheme, product_id: 'prod_1')
    challenge = unpaid_challenge(middleware)
    payload = {
      'x402Version' => 2,
      'payload' => {},
      'accepted' => challenge['accepts'].first,
      'extensions' => {
        'weft.product' => {
          'info' => { 'kind' => 'api', 'product_id' => 'tampered' }
        }
      }
    }
    response = middleware.call(rack_env('/v1/search', payment: Base64.strict_encode64(JSON.generate(payload))))

    assert_equal 0, runs
    assert_equal 402, response[0]
    assert_equal 0, @requests.count { |item| item[:path] == '/verify' }
    decoded = JSON.parse(Base64.strict_decode64(response[1]['PAYMENT-REQUIRED']))
    assert_equal 'extension_echo_mismatch', decoded['error']
  end

  def test_settlement_pending_retries_once
    @settle_mode = :pending_once
    runs = 0
    app = lambda do |_env|
      runs += 1
      [200, { 'Content-Type' => 'application/json' }, ['{"ok":true}']]
    end
    middleware = build(app, scheme: priced_scheme)
    challenge = unpaid_challenge(middleware)
    response = middleware.call(rack_env('/v1/search', payment: payment_header(challenge)))

    assert_equal 1, runs
    assert_equal 200, response[0]
    settles = @requests.select { |item| item[:path] == '/settle' }
    assert_equal 2, settles.length
    assert_equal settles.first[:json], settles.last[:json]
    decoded = JSON.parse(Base64.strict_decode64(response[1]['PAYMENT-RESPONSE']))
    assert_equal true, decoded['success']
    assert_equal '0xabc', decoded['transaction']
  end

  def test_scheme_network_pattern_is_found
    runs = 0
    app = lambda do |_env|
      runs += 1
      [200, {}, ['secret']]
    end
    middleware = build(app, scheme: priced_scheme('777'), network: 'eip155:*')
    response = middleware.call(rack_env('/v1/search'))

    assert_equal 0, runs
    assert_equal 402, response[0]
    challenge = JSON.parse(Base64.strict_decode64(response[1]['PAYMENT-REQUIRED']))
    assert_equal '777', challenge['accepts'].first['amount']
    assert_equal NETWORK, challenge['accepts'].first['network']
  end

  def test_missing_scheme_is_a_construction_error
    called = false
    error = assert_raises(ArgumentError) do
      build(lambda { |_env|
        called = true
        [200, {}, ['secret']]
      }, scheme: nil)
    end

    refute called
    assert_match(/No scheme implementation registered/, error.message)
  end

  def test_route_regex_timeout_requires_payment
    called = false
    app = lambda do |_env|
      called = true
      [200, {}, ['secret']]
    end
    middleware = build(app, scheme: priced_scheme)
    regex = middleware.instance_variable_get(:@compiled).first['regex']
    regex.define_singleton_method(:match?) { |_path| raise Regexp::TimeoutError }
    response = middleware.call(rack_env('/v1/search'))

    assert_equal 402, response[0]
    refute called
  end

  def test_route_patterns_are_protected
    called = []
    app = lambda do |env|
      called << [env['REQUEST_METHOD'], env['PATH_INFO']]
      [200, {}, ['secret']]
    end
    middleware = Weft::Facilitator::RackMiddleware.new(
      app,
      routes: {
        'GET /users/:id' => accepts,
        'GET /items/[id]' => accepts,
        'GET /files/*' => accepts,
        'POST /paid' => accepts
      },
      sync_facilitator_on_start: false,
      facilitator_url: "http://127.0.0.1:#{@port}",
      schemes: [{ 'network' => NETWORK, 'server' => priced_scheme }]
    )

    {
      ['GET', '/users/42'] => false,
      ['GET', '/users/42/extra'] => true,
      ['GET', '/items/7'] => false,
      ['GET', '/items/7/extra'] => true,
      ['GET', '/files'] => false,
      ['GET', '/files/a/b'] => false,
      ['GET', '/filesx'] => true,
      ['POST', '/paid'] => false,
      ['GET', '/paid'] => true
    }.each do |request, passes|
      called.clear
      method, path = request
      response = middleware.call(rack_env(path, method: method))
      if passes
        assert_equal 200, response[0], request.inspect
        assert_equal [[method, path]], called
      else
        assert_equal 402, response[0], request.inspect
        assert_empty called, request.inspect
      end
    end

    star = Weft::Facilitator::RackMiddleware.new(
      app,
      routes: { '*' => accepts },
      sync_facilitator_on_start: false,
      facilitator_url: "http://127.0.0.1:#{@port}",
      schemes: [{ 'network' => NETWORK, 'server' => priced_scheme }]
    )
    called.clear
    response = star.call(rack_env('/any/path', method: 'DELETE'))
    assert_equal 402, response[0]
    assert_empty called
  end

  private

  def build(app, scheme:, network: NETWORK, product_id: nil)
    options = {
      routes: { 'GET /v1/search' => accepts },
      api_key: 'wk_live_abc',
      facilitator_url: "http://127.0.0.1:#{@port}",
      schemes: scheme.nil? ? [] : [{ 'network' => network, 'server' => scheme }]
    }
    options[:product_id] = product_id if product_id
    options[:type] = 'api' if product_id
    Weft::Facilitator::RackMiddleware.new(app, **options)
  end

  def accepts
    {
      'accepts' => {
        'scheme' => 'exact',
        'network' => NETWORK,
        'payTo' => PAY_TO,
        'price' => '$0.01'
      }
    }
  end

  def priced_scheme(amount = '10000')
    {
      'scheme' => 'exact',
      'defaultAssetTransferMethod' => 'authorization',
      'paymentFlows' => {
        'authorization' => { 'supported' => ['authorization'], 'default' => 'authorization' }
      },
      'parsePrice' => ->(_price, _network) { { 'amount' => amount, 'asset' => ASSET } }
    }
  end

  def scheme_without_decimals
    priced_scheme
  end

  def unpaid_challenge(middleware)
    response = middleware.call(rack_env('/v1/search'))
    assert_equal 402, response[0]
    JSON.parse(Base64.strict_decode64(response[1]['PAYMENT-REQUIRED']))
  end

  def payment_header(challenge)
    payload = {
      'x402Version' => 2,
      'payload' => {},
      'accepted' => challenge['accepts'].first
    }
    Base64.strict_encode64(JSON.generate(payload))
  end

  def rack_env(path, method: 'GET', payment: nil)
    env = {
      'REQUEST_METHOD' => method,
      'PATH_INFO' => path,
      'HTTP_HOST' => 'api.acme.test',
      'rack.url_scheme' => 'https',
      'HTTP_ACCEPT' => 'application/json'
    }
    env['HTTP_PAYMENT_SIGNATURE'] = payment if payment
    env
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
    method, path, = lines.shift.to_s.split(' ')
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
    @requests << { method: method, path: path, body: body, json: body.empty? ? nil : JSON.parse(body) }
    respond(socket, path)
  rescue StandardError
    socket.close
  end

  def read_head(socket)
    buffer = +''
    buffer << socket.readpartial(4096) until buffer.include?("\r\n\r\n")
    buffer.split("\r\n\r\n", 2)
  end

  def respond(socket, path)
    status, payload = case path
                      when '/supported'
                        [200, { 'kinds' => [{ 'x402Version' => 2, 'scheme' => 'exact', 'network' => NETWORK }] }]
                      when '/verify'
                        [200, { 'isValid' => true }]
                      when '/settle'
                        if @settle_mode == :pending_once && @requests.count { |item| item[:path] == '/settle' } == 1
                          [503, {
                            'success' => false,
                            'errorReason' => 'settlement_pending',
                            'errorMessage' => 'pending',
                            'payer' => '',
                            'transaction' => '0xbroadcast',
                            'network' => NETWORK
                          }]
                        else
                          [200, { 'success' => true, 'transaction' => '0xabc', 'network' => NETWORK, 'payer' => '0xpayer' }]
                        end
                      else
                        [404, { 'error' => 'missing' }]
                      end
    raw = JSON.generate(payload)
    socket.write(
      "HTTP/1.1 #{status} #{status == 200 ? 'OK' : 'Error'}\r\n" \
      "Content-Type: application/json\r\nContent-Length: #{raw.bytesize}\r\nConnection: close\r\n\r\n#{raw}"
    )
  ensure
    socket.close
  end
end
