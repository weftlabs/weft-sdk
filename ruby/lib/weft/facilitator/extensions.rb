# frozen_string_literal: true

require_relative 'json_wire'
require_relative 'product'

module Weft
  module Facilitator
    WEFT_REQUEST_EXTENSION_KEY = 'weft.request'
    MAX_EXTENSION_BYTES = 16 * 1024
    WEFT_REQUEST_INFO_SCHEMA = {
      '$schema' => 'https://json-schema.org/draft/2020-12/schema',
      'title' => 'Weft per-request context',
      'description' => 'Seller-authored context for one paid request, for display only. ' \
                       'Unauthenticated buyer input by the time it is read; key nothing on it.',
      'type' => 'object',
      'additionalProperties' => true
    }.freeze

    module Extensions
      module_function

      def dynamic_extension(key, sink = nil)
        sink ||= Product.create_warn
        Hook.new(key, sink)
      end

      def register_dynamic_extensions(server, routes)
        keys = dynamic_keys(routes)
        return if keys.empty?

        sink = Product.create_warn
        unless server.respond_to?(:register_extension)
          sink.call(
            'this @x402/core build has no registerExtension, so per-request route ' \
            "extensions (#{keys.join(', ')}) cannot be resolved and will not ship"
          )
          return
        end

        keys.each { |key| server.register_extension(dynamic_extension(key, sink)) }
      end

      def dynamic_keys(routes)
        keys = []
        route_configs(routes).each do |config|
          extensions = Product.read(config, 'extensions')
          next unless extensions.is_a?(Hash)

          extensions.each do |key, value|
            keys << key.to_s if value.respond_to?(:call)
          end
        end
        keys.uniq
      end

      def route_configs(routes)
        return [] unless routes.is_a?(Hash)

        configs = Product.single_route?(routes) ? [routes] : routes.values
        configs.select { |config| config.is_a?(Hash) }
      end
    end

    class Hook
      attr_reader :key

      def initialize(key, sink)
        @key = key
        @sink = sink
      end

      def enrich_payment_required_response(declaration, context)
        return nil unless declaration.respond_to?(:call)

        request = request_of(context)
        unless request
          @sink.call(
            "extensions[#{@key}] is a callback but no HTTP request context " \
            'reached it; dropping the key from the challenge',
            "#{@key}:no-request"
          )
          return drop_key(context)
        end

        begin
          resolved = declaration.call(request)
        rescue StandardError => e
          @sink.call(
            "extensions[#{@key}] callback failed; dropping the key from the " \
            "challenge: #{e.message}",
            "#{@key}:threw"
          )
          return drop_key(context)
        end

        return drop_key(context) if resolved.nil?

        json = JsonWire.generate(resolved)
        if json.nil?
          @sink.call(
            "extensions[#{@key}] callback returned a value JSON cannot carry (a " \
            'function, a circular reference, a BigInt or similar); dropping ' \
            'the key from the challenge',
            "#{@key}:unserializable"
          )
          return drop_key(context)
        end

        wire = JSON.parse(json)
        unless wire.is_a?(Hash)
          @sink.call(
            "extensions[#{@key}] callback returned #{wire.is_a?(Array) ? 'an array' : "a #{js_type(wire)}"}; " \
            'the x402 extensions channel carries objects, so the key is ' \
            'dropped from the challenge',
            "#{@key}:not-an-object"
          )
          return drop_key(context)
        end

        value = if @key == WEFT_REQUEST_EXTENSION_KEY
                  { 'info' => wire, 'schema' => WEFT_REQUEST_INFO_SCHEMA }
                else
                  wire
                end
        bytes = projected_bytes(context, value) || json.bytesize
        if bytes > MAX_EXTENSION_BYTES
          @sink.call(
            "extensions[#{@key}] takes the challenge's extensions to #{bytes} " \
            "bytes, over the #{MAX_EXTENSION_BYTES}-byte facilitator relay " \
            'cap; dropping the key so the rest of the declaration still ' \
            'reaches settlement',
            "#{@key}:over-cap"
          )
          return drop_key(context)
        end

        value
      end

      private

      def request_of(context)
        transport = read_context(context, 'transportContext')
        return nil unless transport.is_a?(Hash)

        Product.read(transport, 'request')
      end

      def drop_key(context)
        response = read_context(context, 'paymentRequiredResponse')
        extensions = response.is_a?(Hash) ? Product.read(response, 'extensions') : nil
        if extensions.is_a?(Hash)
          extensions.delete(@key)
          extensions.delete(@key.to_sym)
        end
        nil
      end

      def projected_bytes(context, value)
        response = read_context(context, 'paymentRequiredResponse')
        extensions = response.is_a?(Hash) ? Product.read(response, 'extensions') : nil
        projected = Product.stringify_hash(extensions || {})
        projected[@key] = value
        json = JsonWire.generate(projected)
        json&.bytesize
      end

      def read_context(context, key)
        Product.read(context, key)
      end

      def js_type(value)
        case value
        when String then 'string'
        when Integer, Float then 'number'
        when TrueClass, FalseClass then 'boolean'
        when nil then 'object'
        else 'object'
        end
      end
    end
  end
end
