# frozen_string_literal: true

require_relative '../generated/version'
require_relative 'json_wire'
require_relative 'product'

module Weft
  module Facilitator
    WEFT_DECLARED_HEADER = 'X-Weft-Declared'
    WEFT_API_KEY_HEADER = 'X-API-Key'
    HEADER_SAFE = /\A[\x21-\x7e]+\z/
    ADAPTER_NAME = 'rack'

    module Handshake
      module_function

      def build_auth_headers(adapter, api_key, declaration)
        declaration = stringify_declaration(declaration)
        key = resolve_api_key(api_key)
        supported = {
          'User-Agent' => "weft-sdk-#{adapter}/#{sdk_version}"
        }
        supported['Authorization'] = "Bearer #{key}" unless key.nil?

        declared = declared_identity_value(declaration)
        supported[WEFT_DECLARED_HEADER] = declared unless declared.nil?

        headers = { 'supported' => supported }
        unless key.nil?
          headers['settle'] = { WEFT_API_KEY_HEADER => key }
          headers['verify'] = { WEFT_API_KEY_HEADER => key }
        end
        headers
      end

      def declared_identity_value(declaration)
        declared = Product.sanitize_product_identity(declaration)
        dimensions = Product.resolve_dimensions(declaration['dimensions'], Product.create_warn)
        payload = {}
        payload['name'] = declared['name'] if declared.key?('name')
        payload['type'] = declared['type'] if declared.key?('type')
        payload['tags'] = declared['tags'] if declared.key?('tags')
        payload['icon_url'] = declared['iconUrl'] if declared.key?('iconUrl')
        payload['dimensions'] = dimensions unless dimensions.nil?
        return nil if payload.empty?

        JsonWire.base64url_encode(JsonWire.generate(payload))
      end

      def resolve_api_key(api_key)
        return nil if api_key.nil?
        unless api_key.is_a?(String)
          warn "[weft] ignoring apiKey: expected a string, got #{js_type(api_key)}"
          return nil
        end

        trimmed = api_key.strip
        if trimmed.empty?
          warn '[weft] ignoring empty apiKey'
          return nil
        end
        unless HEADER_SAFE.match?(trimmed)
          warn '[weft] ignoring apiKey: it contains whitespace or non-printable ' \
               'characters that cannot travel in an HTTP header'
          return nil
        end

        trimmed
      end

      def stringify_declaration(declaration)
        return {} unless declaration.is_a?(Hash)

        declaration.each_with_object({}) do |(key, value), out|
          out[key.to_s] = value
        end
      end

      def sdk_version
        defined?(SDK) ? SDK::VERSION : VERSION
      end

      def js_type(value)
        case value
        when Integer, Float then 'number'
        when TrueClass, FalseClass then 'boolean'
        else 'object'
        end
      end
    end
  end
end
