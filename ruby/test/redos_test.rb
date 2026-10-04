# frozen_string_literal: true

require 'minitest/autorun'

require_relative '../lib/weft/sdk'

class RedosTest < Minitest::Test
  # A polynomial match on 100_000 characters takes seconds. One second still
  # catches that, and it does not fail on a slow shared CI runner.
  LIMIT_SECONDS = 1.0
  LENGTH = 100_000

  def test_normalize_path_trailing_slashes_stay_linear
    path = '/' * LENGTH
    result = nil
    elapsed = timed { result = Weft::Facilitator::X402.normalize_path(path) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal '/', result
  end

  def test_route_pattern_scan_stays_linear
    pattern = 'a' * LENGTH
    parsed = nil
    elapsed = timed { parsed = Weft::Facilitator::X402.parse_route_pattern(pattern) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_nil Regexp.timeout
    assert_in_delta 0.05, parsed['regex'].timeout, 0.0001
    matched = nil
    elapsed = timed { matched = parsed['regex'].match?(pattern) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal true, matched

    wild = Weft::Facilitator::X402.parse_route_pattern('*')
    elapsed = timed { matched = wild['regex'].match?('a' * LENGTH) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal true, matched
  end

  def test_core_suffix_patterns_match
    name = Weft::Facilitator::X402.parse_route_pattern('/files/:name.json')
    assert_equal true, name['regex'].match?('/files/a.b.json')
    assert_equal true, name['regex'].match?('/files/ab.json')
    pair = Weft::Facilitator::X402.parse_route_pattern('/a/[x]-[y]')
    assert_equal true, pair['regex'].match?('/a/p-q-r')
  end

  def test_route_match_timeout_is_not_global
    parsed = Weft::Facilitator::X402.parse_route_pattern('/paid')
    assert_nil Regexp.timeout
    assert_in_delta 0.05, parsed['regex'].timeout, 0.0001
  end

  def test_amount_scan_stays_linear
    amount = "#{'1' * LENGTH}."
    result = nil
    elapsed = timed { result = Weft::Facilitator::X402.convert_to_token_amount(amount, 2) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal "#{'1' * LENGTH}00", result
  end

  def test_base_url_trailing_slashes_stay_linear
    base_url = "https://api.example#{'/' * LENGTH}"
    client = nil
    elapsed = timed { client = Weft::Client.new(api_key: 'wk_test', base_url: base_url) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    config = client.instance_variable_get(:@api_client).config
    assert_equal 'api.example', config.host
    assert_equal '', config.base_path
    assert_equal 'https://api.example', config.base_url
  end

  private

  def timed
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  end
end
