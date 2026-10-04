# frozen_string_literal: true

module Weft
  module Facilitator
    module Echo
      ADDITIVE_ARRAY_INFO_FIELDS = { 'builder-code' => ['s'] }.freeze
      ADDITIVE_ARRAY_MAX_LENGTHS = { 'builder-code' => { 's' => 10 } }.freeze

      module_function

      def validate(payment_required, payment, dynamic_fields: {})
        return { 'valid' => true } unless payment.is_a?(Hash) && payment['x402Version'] == 2

        server_extensions = payment_required['extensions']
        return { 'valid' => true } unless server_extensions.is_a?(Hash) && !server_extensions.empty?

        client_extensions = payment['extensions']
        return { 'valid' => true } unless client_extensions.is_a?(Hash) && !client_extensions.empty?

        client_extensions.each do |key, echoed|
          next unless server_extensions.key?(key)

          fields = dynamic_fields[key]
          advertised = omit_fields(extension_info(server_extensions[key]), fields)
          echoed_info = omit_fields(extension_info(echoed), fields)
          additive = ADDITIVE_ARRAY_INFO_FIELDS[key]
          limits = ADDITIVE_ARRAY_MAX_LENGTHS[key]
          next if contains_subset?(advertised, echoed_info, additive, limits)

          return { 'valid' => false, 'invalidReason' => 'extension_echo_mismatch', 'extensionKey' => key }
        end
        { 'valid' => true }
      end

      def extension_info(value)
        return value['info'] if value.is_a?(Hash) && value.key?('info')

        value
      end

      def omit_fields(value, fields)
        return value if fields.nil? || fields.empty? || !value.is_a?(Hash)

        copy = value.dup
        fields.each { |field| copy.delete(field) }
        copy
      end

      def contains_subset?(expected, actual, additive = nil, max_lengths = nil, field_key = nil)
        if field_key && additive&.include?(field_key) && (expected.is_a?(Array) || actual.is_a?(Array))
          expected_array = comparable_array(expected)
          actual_array = comparable_array(actual)
          return false unless expected_array && actual_array

          max = max_lengths && max_lengths[field_key]
          return false if max && actual_array.length > max

          return expected_array.all? { |item| actual_array.any? { |other| deep_equal?(item, other) } }
        end
        return deep_equal?(expected, actual) if expected.nil? || !expected.is_a?(Hash)
        return false unless actual.is_a?(Hash)

        expected.all? do |key, value|
          if actual.key?(key)
            contains_subset?(value, actual[key], additive, max_lengths, key)
          else
            value.nil?
          end
        end
      end

      def comparable_array(value)
        return value if value.is_a?(Array)
        return nil if value.nil? || value.is_a?(Hash)

        [value]
      end

      def deep_equal?(left, right)
        return true if left.nil? && right.nil?
        return false if left.nil? || right.nil?

        case left
        when Hash
          return false unless right.is_a?(Hash)
          return false unless left.keys.map(&:to_s).sort == right.keys.map(&:to_s).sort

          left.all? { |key, value| deep_equal?(value, right[key] || right[key.to_s]) }
        when Array
          return false unless right.is_a?(Array) && left.length == right.length

          left.zip(right).all? { |item, other| deep_equal?(item, other) }
        else
          left == right
        end
      end
    end
  end
end
