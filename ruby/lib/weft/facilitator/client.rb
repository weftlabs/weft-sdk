# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

require_relative 'handshake'
require_relative 'json_wire'
require_relative 'settlement'

module Weft
  module Facilitator
    DEFAULT_URL = 'https://x402.weft.network'
    DEFAULT_ENV = 'X402_FACILITATOR_URL'
    PATH_KEYS = %w[verify settle supported bazaar].freeze
    SUPPORTED_RETRIES = 3
    DEFAULT_TIMEOUT_MS = 30_000

    module_function

    def resolve_url(config = nil)
      url = config_url(config)
      return url unless url.nil? || url.empty?

      env = ENV.fetch(DEFAULT_ENV, nil)
      return env unless env.nil? || env.empty?

      DEFAULT_URL
    end

    def validate_url(url)
      if url.nil? || url.strip.empty?
        raise ArgumentError, 'Invalid URL: URL cannot be empty'
      end
      return if url.start_with?('http://') || url.start_with?('https://')

      raise ArgumentError,
            "Invalid URL format: URL must start with http:// or https://, got: #{url}"
    end

    def config_url(config)
      return nil unless config.is_a?(Hash)
      return config['url'] if config.key?('url')
      return config[:url] if config.key?(:url)

      nil
    end

    def merge_seller_wins(derived, seller)
      merged = derived.dup
      (seller || {}).each do |name, value|
        merged.delete_if { |existing, _| existing.to_s.casecmp?(name.to_s) }
        merged[name.to_s] = value
      end
      merged
    end

    def assert_path_keyed_auth_headers(headers)
      return unless headers.is_a?(Hash)

      header_object = lambda do |value|
        value.is_a?(Hash)
      end
      has_path_key = PATH_KEYS.any? { |key| header_object.call(headers[key] || headers[key.to_sym]) }
      looks_flat = !has_path_key && headers.values.any? { |value| !header_object.call(value) }
      return unless looks_flat

      raise ArgumentError,
            'createAuthHeaders must return an object keyed by facilitator path, ' \
            'e.g. { verify: { Authorization: "..." }, settle: { ... }, ' \
            'supported: { ... } }, but received a flat headers object.'
    end

    class Client
      def initialize(url: nil, create_headers: nil, timeout_ms: DEFAULT_TIMEOUT_MS)
        resolved = Facilitator.resolve_url(url.nil? ? nil : { 'url' => url })
        Facilitator.validate_url(resolved)
        @url = resolved.sub(%r{/+\z}, '')
        @create_headers = create_headers
        @timeout_ms = timeout_ms
      end

      def verify(payment_payload:, payment_requirements:)
        post_json('/verify', 'verify', {
                    'x402Version' => payment_payload['x402Version'] || payment_payload[:x402Version] || 2,
                    'paymentPayload' => payment_payload,
                    'paymentRequirements' => payment_requirements
                  })
      end

      def settle(payment_payload:, payment_requirements:)
        begin
          post_json('/settle', 'settle', {
                      'x402Version' => payment_payload['x402Version'] || payment_payload[:x402Version] || 2,
                      'paymentPayload' => payment_payload,
                      'paymentRequirements' => payment_requirements
                    })
        rescue SettleError => e
          raise FacilitatorUnavailableError if SettleErrors.unavailable?(e)

          raise
        end
      end

      def supported
        last_error = nil
        SUPPORTED_RETRIES.times do |attempt|
          begin
            return get_json('/supported', 'supported')
          rescue RateLimited => e
            last_error = e
            sleep(e.retry_after) if attempt < SUPPORTED_RETRIES - 1
          end
        end
        raise last_error || StandardError, 'Facilitator getSupported failed'
      end

      private

      def headers_for(scope)
        headers = { 'Content-Type' => 'application/json' }
        return headers unless @create_headers

        custom = @create_headers.call
        Facilitator.assert_path_keyed_auth_headers(custom) if custom
        scope_headers = custom.is_a?(Hash) ? (custom[scope] || custom[scope.to_sym]) : nil
        headers.merge(scope_headers || {})
      end

      def get_json(path, scope)
        uri = URI.parse("#{@url}#{path}")
        request = Net::HTTP::Get.new(uri)
        headers_for(scope).each { |name, value| request[name] = value }
        response = perform(uri, request)
        parse_response(response, scope)
      end

      def post_json(path, scope, body)
        uri = URI.parse("#{@url}#{path}")
        request = Net::HTTP::Post.new(uri)
        headers_for(scope).each { |name, value| request[name] = value }
        request.body = JsonWire.generate(body)
        response = perform(uri, request)
        parse_response(response, scope)
      end

      def perform(uri, request)
        Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: uri.scheme == 'https',
          open_timeout: @timeout_ms / 1000.0,
          read_timeout: @timeout_ms / 1000.0
        ) do |http|
          http.request(request)
        end
      end

      def parse_response(response, scope)
        return JSON.parse(response.body) if response.is_a?(Net::HTTPSuccess)

        text = response.body.to_s
        data = begin
          JSON.parse(text)
        rescue JSON::ParserError
          nil
        end
        if scope == 'settle' && data.is_a?(Hash) && data.key?('success')
          raise SettleError.new(response.code.to_i, data)
        end
        if scope == 'verify' && data.is_a?(Hash) && data.key?('isValid')
          raise StandardError, verify_failure_message(response.code, data)
        end
        raise RateLimited.new(response['retry-after']) if response.code.to_i == 429

        excerpt = text.length > 200 ? "#{text[0, 200]}..." : text
        raise StandardError, "Facilitator #{scope_name(scope)} failed (#{response.code}): #{excerpt}"
      end

      def scope_name(scope)
        scope == 'supported' ? 'getSupported' : scope
      end

      def verify_failure_message(code, data)
        reason = data['invalidReason'] || 'unknown reason'
        message = data['invalidMessage']
        message ? "#{reason}: #{message}" : reason.to_s
      end
    end

    class RateLimited < StandardError
      attr_reader :retry_after

      def initialize(header)
        @retry_after = header.to_i
        @retry_after = 1 if @retry_after <= 0
        super('Facilitator getSupported failed (429)')
      end
    end
  end
end
