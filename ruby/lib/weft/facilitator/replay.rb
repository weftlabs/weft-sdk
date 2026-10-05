# frozen_string_literal: true

require 'base64'
require 'json'

require_relative 'json_wire'

module Weft
  module Facilitator
    module Replay
      module_function

      def payment_resume_candidate(context)
        header = payment_header(context)
        return nil if header.nil? || header.empty?

        payload = JSON.parse(JsonWire.base64_decode(header))
        return nil unless payload.is_a?(Hash)
        return nil unless payload['x402Version'] == 2
        return nil unless payload['accepted'].is_a?(Hash)
        return nil unless payload['payload'].is_a?(Hash)
        return nil unless payload['accepted']['scheme'].is_a?(String)
        return nil unless payload['accepted']['network'].is_a?(String)

        {
          'paymentPayload' => payload,
          'paymentRequirements' => payload['accepted']
        }
      rescue StandardError
        nil
      end

      def payment_header(context)
        return nil unless context.is_a?(Hash)

        direct = Product.read(context, 'paymentHeader')
        return direct unless direct.nil?

        adapter = Product.read(context, 'adapter')
        return nil unless adapter.respond_to?(:get_header)

        adapter.get_header('payment-signature') || adapter.get_header('PAYMENT-SIGNATURE')
      end
    end
  end
end
