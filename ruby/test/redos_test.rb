# frozen_string_literal: true

require 'minitest/autorun'

require_relative '../lib/weft/sdk'

class RedosTest < Minitest::Test
  LIMIT_SECONDS = 0.1
  LENGTH = 100_000

  def test_normalize_path_trailing_slashes_stay_linear
    path = '/' * LENGTH
    result = nil
    elapsed = timed { result = Weft::Facilitator::X402.normalize_path(path) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal '/', result
  end

  def test_route_pattern_scan_stays_linear
    pattern = '[' * LENGTH
    matcher = nil
    elapsed = timed { matcher = Weft::Facilitator::X402.parse_route_pattern(pattern) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    matched = nil
    elapsed = timed { matched = matcher['regex'].match?(pattern) }
    assert_operator elapsed, :<, LIMIT_SECONDS
    assert_equal true, matched
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
