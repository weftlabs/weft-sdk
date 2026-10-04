# frozen_string_literal: true

require 'json'

require_relative 'json_wire'

module Weft
  module Facilitator
    FACILITATOR_UNAVAILABLE_ERROR = 'weft:facilitator-settle-unavailable'
    CORE_FACILITATOR_UNAVAILABLE = /^Facilitator settle failed \(503\):(?: |$)/
    SETTLEMENT_OVERRIDES_HEADER = 'Settlement-Overrides'
    PAYMENT_REQUIRED_CACHE_CONTROL = 'no-store'
    SYNC_RETRY_FLOOR_MS = 30_000

    module Settlement
      module_function

      def facilitator_unavailable?(reason)
        return false if reason.nil?

        text = reason.to_s
        text == FACILITATOR_UNAVAILABLE_ERROR || CORE_FACILITATOR_UNAVAILABLE.match?(text)
      end

      def with_private_cache_control(value)
        return 'private' if value.nil? || value.to_s.empty?

        directives = value.to_s.split(',').map { |part| part.strip.downcase }
        return value if directives.include?('private')

        "#{value}, private"
      end

      def json_response?(headers)
        content_type = header_value(headers, 'content-type')
        return false if content_type.nil?

        /^(application\/json|[^;]+\+json)(?:;|$)/i.match?(content_type)
      end

      def header_value(headers, name)
        return nil unless headers.is_a?(Hash)

        pair = headers.find { |key, _| key.to_s.casecmp?(name) }
        return nil unless pair

        value = pair[1]
        value.is_a?(Array) ? value[0] : value
      end

      def unavailable_response?(response)
        body = response[:body] || response['body']
        if body.is_a?(Hash)
          %w[errorReason error].each do |field|
            text = body[field] || body[field.to_sym]
            return true if text.is_a?(String) && facilitator_unavailable?(text)
          end
        end

        encoded = header_value(response[:headers] || response['headers'], 'payment-response')
        return false if encoded.nil? || encoded.empty?

        decoded = JSON.parse(JsonWire.base64_decode(encoded))
        facilitator_unavailable?(decoded['errorReason'])
      rescue StandardError
        false
      end
    end

    class SettleError < StandardError
      attr_reader :status_code, :error_reason, :error_message, :payer, :transaction, :network

      def initialize(status_code, response)
        response = {} unless response.is_a?(Hash)
        @status_code = status_code
        @error_reason = response['errorReason'] || response[:errorReason]
        @error_message = response['errorMessage'] || response[:errorMessage]
        @payer = response['payer'] || response[:payer]
        @transaction = response['transaction'] || response[:transaction]
        @network = response['network'] || response[:network]
        reason = @error_reason || 'unknown reason'
        message = @error_message
        super(message ? "#{reason}: #{message}" : reason.to_s)
      end
    end

    class FacilitatorUnavailableError < StandardError
      def initialize
        super(FACILITATOR_UNAVAILABLE_ERROR)
      end

      def status_code
        503
      end
    end

    module SettleErrors
      module_function

      def unavailable?(error)
        return false unless error.is_a?(SettleError)
        return false unless error.status_code == 503
        return false unless defined_field?(error, :@error_reason)
        return false unless defined_field?(error, :@error_message)
        return false unless defined_field?(error, :@payer)
        return false unless defined_field?(error, :@transaction)
        return false unless defined_field?(error, :@network)

        !(error.error_reason == 'settlement_pending' && !error.transaction.to_s.empty?)
      end

      def defined_field?(error, name)
        error.instance_variable_defined?(name)
      end
    end
  end
end
