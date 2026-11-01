require 'minitest/autorun'
require_relative '../lib/weft/facilitator/client'

class ClientTest < Minitest::Test
  def test_default_url
    client = Weft::Facilitator::Client.new
    # Should not raise — uses default URL
    assert_instance_of Weft::Facilitator::Client, client
  end

  def test_custom_url
    client = Weft::Facilitator::Client.new(url: 'https://custom.example.com')
    assert_instance_of Weft::Facilitator::Client, client
  end

  def test_env_url
    original = ENV.fetch('X402_FACILITATOR_URL', nil)
    ENV['X402_FACILITATOR_URL'] = 'https://env.example.com'
    client = Weft::Facilitator::Client.new
    assert_instance_of Weft::Facilitator::Client, client
  ensure
    if original
      ENV['X402_FACILITATOR_URL'] = original
    else
      ENV.delete('X402_FACILITATOR_URL')
    end
  end

  def test_custom_url_takes_precedence_over_env
    original = ENV.fetch('X402_FACILITATOR_URL', nil)
    ENV['X402_FACILITATOR_URL'] = 'https://env.example.com'
    # Should not raise even when env is set
    client = Weft::Facilitator::Client.new(url: 'https://custom.example.com')
    assert_instance_of Weft::Facilitator::Client, client
  ensure
    if original
      ENV['X402_FACILITATOR_URL'] = original
    else
      ENV.delete('X402_FACILITATOR_URL')
    end
  end

  def test_rejects_invalid_url
    assert_raises(ArgumentError) do
      Weft::Facilitator::Client.new(url: 'not-a-url')
    end
  end

  def test_refuses_remote_http_url_before_the_api_key_is_used
    error = assert_raises(ArgumentError) { Weft::Facilitator::Client.new(url: 'http://x402.example') }
    assert_includes error.message, 'use https://'

    previous = ENV.fetch('X402_FACILITATOR_URL', nil)
    ENV['X402_FACILITATOR_URL'] = 'http://x402.example'
    assert_raises(ArgumentError) { Weft::Facilitator::Client.new }
  ensure
    ENV['X402_FACILITATOR_URL'] = previous
  end

  def test_falls_back_to_default_on_empty_url
    # Empty string is treated as "not provided" — falls back to default
    client = Weft::Facilitator::Client.new(url: '')
    assert_instance_of Weft::Facilitator::Client, client
  end
end
