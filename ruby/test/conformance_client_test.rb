# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'time'
require 'typhoeus'
require 'uri'

require_relative '../lib/weft/sdk'

class ConformanceClientTest < Minitest::Test
  ROOT = File.expand_path('../../conformance/client', __dir__)
  SEARCH_FIELDS = {
    'query' => :query,
    'maxResults' => :max_results,
    'filters' => :filters
  }.freeze
  FETCH_FIELDS = {
    'url' => :url,
    'maxCostUsd' => :max_cost_usd,
    'method' => :method,
    'body' => :body,
    'headers' => :headers,
    'searchId' => :search_id,
    'operationId' => :operation_id,
    'accessMethodId' => :access_method_id
  }.freeze
  FETCH_OPTIONS = { 'idempotencyKey' => :idempotency_key }.freeze
  PURCHASE_FIELDS = { 'page' => :page, 'perPage' => :per_page }.freeze

  def self.cases
    @cases ||= Dir[File.join(ROOT, '*.json')].sort.flat_map do |path|
      parsed = JSON.parse(File.read(path))
      raise "#{path} must be an array of cases" unless parsed.is_a?(Array)

      parsed.map { |item| [File.basename(path), item] }
    end
  end

  def test_loads_every_client_fixture
    refute_empty self.class.cases
  end

  def test_every_client_case
    failures = []
    self.class.cases.each do |filename, test_case|
      languages = test_case['languages']
      if languages && !languages.include?('ruby')
        failures << "#{filename}: #{test_case['name']} skipped without a reason" unless test_case['reason']
        next
      end

      run_case(filename, test_case)
    rescue Minitest::Assertion => e
      failures << "#{filename}: #{test_case['name']}\n#{e.message}"
    end
    assert_empty failures, failures.join("\n\n")
  end

  private

  def run_case(_filename, test_case)
    calls = []
    Typhoeus::Expectation.clear
    Typhoeus.stub(/.*/) do |request|
      calls << request
      response = test_case['response'] || {}
      if response['networkFailure']
        Typhoeus::Response.new(code: 0, return_message: 'connection reset')
      else
        raw = response['body']
        payload = raw.is_a?(String) ? raw : JSON.generate(raw)
        Typhoeus::Response.new(
          code: response['status'] || 200,
          status_message: response['reason'],
          body: payload,
          headers: response['headers'] || {}
        )
      end
    end

    thrown = nil
    result = nil
    begin
      client = build_client(test_case['client'])
      result = invoke(client, test_case)
    rescue StandardError => e
      thrown = e
    end

    if test_case['expectValidationError']
      refute_nil thrown, 'expected a validation error'
      assert_empty calls
      return
    end

    if test_case['expectError']
      assert_instance_of Weft::RequestError, thrown
      expected = test_case['expectError']
      assert_equal expected['status'], thrown.status
      assert_equal expected['code'], thrown.code
      assert_equal expected['message'], thrown.message
      assert_nil_or_equal expected['requestId'], thrown.request_id
      assert_equal expected['retryable'], thrown.retryable
      assert_nil_or_equal expected['details'], thrown.details if expected.key?('details')
    else
      assert_nil thrown, thrown&.full_message
      assert_equal test_case['expectResult'], wire(result)
    end

    expected_request = test_case['expectRequest']
    return unless expected_request

    assert_equal 1, calls.length
    recorded = calls.first
    base = (test_case['client']['baseUrl'] || 'https://weft.network').sub(%r{/+\z}, '')
    assert_equal base + expected_request['path'], recorded.base_url
    assert_equal expected_request['method'], recorded.options[:method].to_s.upcase
    assert_equal expected_request['query'], query_of(recorded)
    headers = header_map(recorded.options[:headers])
    expected_request['headers'].each do |name, value|
      assert_equal value, headers[name.downcase], "header #{name}"
    end
    assert_nil headers['idempotency-key'] if test_case['call']['method'] != 'fetch'
    if expected_request.key?('jsonBody')
      assert_equal expected_request['jsonBody'], JSON.parse(recorded.options[:body])
    else
      assert_nil recorded.options[:body]
    end
  ensure
    Typhoeus::Expectation.clear
  end

  def build_client(spec)
    kwargs = {}
    kwargs[:api_key] = spec['credential'] if spec.key?('credential')
    kwargs[:access_token] = spec['accessToken'] if spec.key?('accessToken')
    kwargs[:base_url] = spec['baseUrl'] if spec.key?('baseUrl')
    Weft::Client.new(**kwargs)
  end

  def invoke(client, test_case)
    method = test_case['call']['method']
    args = test_case['call']['args'] || {}
    case method
    when 'me' then client.me
    when 'balance' then client.balance
    when 'search'
      request = map_fields(args['request'], SEARCH_FIELDS)
      client.search(**request)
    when 'fetch'
      request = map_fields(args['request'], FETCH_FIELDS)
      options = map_fields(args['options'], FETCH_OPTIONS)
      client.fetch(**request, **options)
    when 'purchases'
      client.purchases(**map_fields(args['options'] || {}, PURCHASE_FIELDS))
    when 'purchase'
      client.purchase(args['id'])
    else
      raise "unknown call #{method}"
    end
  end

  def map_fields(source, table)
    unknown = source.keys.map(&:to_s) - table.keys
    raise "unmapped call fields: #{unknown}" unless unknown.empty?

    source.each_with_object({}) do |(key, value), out|
      out[table[key.to_s]] = value
    end
  end

  def assert_nil_or_equal(expected, actual)
    if expected.nil?
      assert_nil actual
    else
      assert_equal expected, actual
    end
  end

  def query_of(request)
    params = request.options[:params] || {}
    params.each_with_object({}) do |(key, value), out|
      out[key.to_s] = value.to_s
    end
  end

  def header_map(headers)
    (headers || {}).each_with_object({}) do |(name, value), out|
      out[name.to_s.downcase] = value.is_a?(Array) ? value.first.to_s : value.to_s
    end
  end

  def wire(model)
    JSON.parse(JSON.generate(deep_wire(model.to_hash)))
  end

  def deep_wire(value)
    case value
    when Hash
      value.each_with_object({}) { |(key, item), out| out[key.to_s] = deep_wire(item) }
    when Array
      value.map { |item| deep_wire(item) }
    when Time
      utc = value.getutc
      format('%s.%03dZ', utc.strftime('%Y-%m-%dT%H:%M:%S'), utc.usec / 1000)
    else
      value
    end
  end
end
