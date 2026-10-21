# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'socket'

require_relative '../lib/weft/sdk'

# A middleware built per request must not handshake per request.
class SharedHandshakeTest < Minitest::Test
  NETWORK = 'eip155:84532'

  def setup
    Weft::Facilitator::SharedSupported.reset!
    Weft::Facilitator::Fee.invalidate_fee_cache
    @requests = []
    @status = 200
    @server = TCPServer.new('127.0.0.1', 0)
    @port = @server.addr[1]
    @accept = Thread.new { accept_loop }
    @now = 1000.0
    Weft::Facilitator::SharedSupported.clock = -> { @now }
  end

  def teardown
    Weft::Facilitator::SharedSupported.clock = -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
    @server.close
    @accept.join(2)
  end

  def test_many_constructions_make_one_supported_call
    5.times { build('wk_live_a') }
    assert_equal 1, supported_calls.size
  end

  def test_different_api_key_is_a_different_handshake
    build('wk_live_a')
    build('wk_live_b')
    assert_equal 2, supported_calls.size
  end

  def test_failed_sync_holds_the_floor_then_retries
    @status = 503
    _, err = capture_io { 2.times { build('wk_live_a') } }
    assert_equal 1, supported_calls.size
    assert_includes err, 'facilitator sync failed'
    @now += 31
    capture_io { build('wk_live_a') }
    assert_equal 2, supported_calls.size
  end

  def test_warns_once_when_constructed_many_times
    _, err = capture_io { 15.times { build('wk_live_a') } }
    assert_equal 1, err.scan('constructed more than').size
  end

  def test_fee_refresh_is_not_a_handshake
    @fee = { 'amount' => '1', 'asset' => 'USDC', 'network' => NETWORK }
    client = Weft::Facilitator::Client.new(url: "http://127.0.0.1:#{@port}")
    Weft::Facilitator::Fee.get_fee_info(client: client)
    call = supported_calls.fetch(0)
    assert_nil call['authorization']
    assert_nil call['x-weft-declared']
  end

  private

  def supported_calls
    @requests.select { |headers| headers[:path] == '/supported' }.map { |r| r[:headers] }
  end

  def build(api_key)
    middleware = Weft::Facilitator::RackMiddleware.new(
      ->(_env) { [200, {}, ['OK']] },
      routes: { 'GET /v1/search' => { 'accepts' => { 'scheme' => 'exact', 'network' => NETWORK,
                                                     'payTo' => '0x1', 'price' => '$0.01' } } },
      api_key: api_key,
      facilitator_url: "http://127.0.0.1:#{@port}",
      schemes: [{ 'network' => NETWORK, 'server' => scheme }]
    )
    middleware.call('REQUEST_METHOD' => 'GET', 'PATH_INFO' => '/v1/search',
                    'HTTP_HOST' => 'localhost', 'rack.url_scheme' => 'https')
  end

  def scheme
    {
      'scheme' => 'exact',
      'defaultAssetTransferMethod' => 'authorization',
      'paymentFlows' => { 'authorization' => { 'supported' => ['authorization'], 'default' => 'authorization' } },
      'parsePrice' => ->(_price, _network) { { 'amount' => '10000', 'asset' => '0x1' } },
      'enhancePaymentRequirements' => ->(requirements, _kind, _extensions) { requirements }
    }
  end

  def accept_loop
    loop do
      socket = @server.accept
      Thread.new(socket) { |s| serve(s) }
    end
  rescue IOError, Errno::EBADF
    nil
  end

  def serve(socket)
    head = +''
    head << socket.readpartial(4096) until head.include?("\r\n\r\n")
    lines = head.split("\r\n\r\n", 2).first.split("\r\n")
    path = lines.shift.split(' ')[1]
    headers = lines.to_h { |line| line.split(':', 2).then { |n, v| [n.downcase, v.strip] } }
    @requests << { path: path, headers: headers }
    body = if @status == 200
             { 'kinds' => [{ 'x402Version' => 2, 'scheme' => 'exact', 'network' => NETWORK }],
               'extensions' => [], 'signers' => {}, 'fee' => @fee }.compact
           else
             { 'error' => 'down' }
           end
    raw = JSON.generate(body)
    socket.write("HTTP/1.1 #{@status} X\r\nContent-Type: application/json\r\n" \
                 "Content-Length: #{raw.bytesize}\r\nConnection: close\r\n\r\n#{raw}")
  rescue StandardError
    nil
  ensure
    socket.close
  end
end
