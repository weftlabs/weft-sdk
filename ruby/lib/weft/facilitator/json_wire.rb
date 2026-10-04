# frozen_string_literal: true

require 'base64'
require 'json'

module Weft
  module Facilitator
    # JSON.stringify and the two base64 forms @x402/core puts on the wire.
    module JsonWire
      module_function

      def generate(value)
        return nil if circular?(value)

        JSON.generate(sanitize(value))
      rescue JSON::GeneratorError, JSON::NestingError
        nil
      end

      def circular?(value, seen = {})
        case value
        when Hash, Array
          return true if seen[value.object_id]

          seen[value.object_id] = true
          children = value.is_a?(Hash) ? value.values : value
          children.any? { |item| circular?(item, seen) }
        else
          false
        end
      end

      def sanitize(value)
        case value
        when Hash
          value.each_with_object({}) do |(key, item), out|
            out[key.is_a?(Symbol) ? key.to_s : key] = sanitize(item)
          end
        when Array
          value.map { |item| sanitize(item) }
        when Float
          value.finite? ? value : nil
        else
          value
        end
      end

      def base64_encode(text)
        Base64.strict_encode64(text.b)
      end

      def base64_decode(text)
        Base64.strict_decode64(text).force_encoding(Encoding::UTF_8)
      end

      def base64url_encode(text)
        Base64.urlsafe_encode64(text.b, padding: false)
      end

      def base64url_decode(text)
        padded = text.tr('-_', '+/')
        padded += '=' * ((4 - (padded.length % 4)) % 4)
        Base64.decode64(padded).force_encoding(Encoding::UTF_8)
      end

      def encode_json(value)
        json = generate(value)
        raise ArgumentError, 'value is not JSON' if json.nil?

        base64_encode(json)
      end
    end
  end
end
