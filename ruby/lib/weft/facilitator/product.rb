# frozen_string_literal: true

require 'json'
require 'uri'

module Weft
  module Facilitator
    module Product
      PRODUCT_TYPES = %w[api agent mcp].freeze
      WEFT_TYPE_TAG_PREFIX = 'weft:type:'
      WEFT_PRODUCT_EXTENSION_KEY = 'weft.product'
      MAX_TAGS = 5
      MAX_TAG_CHARS = 32
      MAX_DIMENSIONS = 8
      MAX_DIMENSION_CHARS = 64
      DIMENSION_NAME = /\A[A-Za-z_][A-Za-z0-9_.-]*\z/
      MAX_SERVICE_NAME_CHARS = 32
      MAX_ICON_URL_CHARS = 2048
      PRINTABLE_ASCII = /\A[\x20-\x7e]+\z/

      WEFT_PRODUCT_INFO_SCHEMA = {
        '$schema' => 'https://json-schema.org/draft/2020-12/schema',
        'type' => 'object',
        'properties' => {
          'kind' => { 'type' => 'string', 'enum' => PRODUCT_TYPES.dup },
          'product_id' => { 'type' => 'string', 'minLength' => 1 },
          'manifest_hash' => { 'type' => 'string', 'minLength' => 1 }
        },
        'additionalProperties' => false
      }.freeze

      module_function

      def product_type_tag(type)
        "#{WEFT_TYPE_TAG_PREFIX}#{type}"
      end

      def create_warn
        seen = {}
        lambda do |message, dedupe_key = nil|
          key = dedupe_key || message
          return if seen[key]

          seen[key] = true
          warn "[weft] #{message}"
        end
      end

      def apply_product_identity(routes, identity)
        identity = stringify_hash(identity)
        return routes unless routes.is_a?(Hash)
        return routes unless has_product_identity?(identity) || has_route_identity?(routes)

        sink = create_warn
        if single_route?(routes)
          apply_to_route(routes, identity, sink)
        else
          routes.each_with_object({}) do |(pattern, route), out|
            out[pattern] = apply_to_route(route, identity, sink)
          end
        end
      end

      def sanitize_product_identity(identity)
        identity = stringify_hash(identity)
        silent = ->(*) {}
        type = resolve_type(read(identity, 'type'), 'type', silent)
        name = resolve_service_name(nil, read(identity, 'name'), silent)
        icon = resolve_icon_url(nil, read(identity, 'iconUrl'), silent)
        tags = resolve_tags(nil, read(identity, 'tags'), type, silent)
        tags = tags&.reject { |tag| reserved_type_tag?(tag) }
        out = {}
        out['name'] = name unless name.nil?
        out['type'] = type unless type.nil?
        out['tags'] = tags if tags.is_a?(Array) && !tags.empty?
        out['iconUrl'] = icon unless icon.nil?
        out
      end

      def resolve_dimensions(value, sink)
        declared = as_tag_list(value, 'dimensions', sink)
        return nil if declared.nil?

        malformed = []
        named = declared.select do |name|
          if name.length <= MAX_DIMENSION_CHARS && DIMENSION_NAME.match?(name)
            true
          else
            malformed << name
            false
          end
        end
        unless malformed.empty?
          sink.call(
            "dropping #{malformed.length} dimension(s) that do not name a field " \
            "(max #{MAX_DIMENSION_CHARS} characters, starting with a letter or " \
            "underscore): #{malformed.join(', ')}"
          )
        end
        deduped = named.uniq
        if deduped.length > MAX_DIMENSIONS
          sink.call(
            "dropping #{deduped.length - MAX_DIMENSIONS} dimension(s): at most " \
            "#{MAX_DIMENSIONS} travel. Dropped: #{deduped.drop(MAX_DIMENSIONS).join(', ')}"
          )
        end
        bounded = deduped.take(MAX_DIMENSIONS)
        bounded.empty? ? nil : bounded
      end

      def apply_to_route(route, identity, sink)
        unless route.is_a?(Hash)
          sink.call(
            "ignoring route #{show(route)}: expected a route config object, got #{type_name(route)}"
          )
          return route
        end

        rest = route.dup
        declared_type = take(rest, 'type')
        declared_name = take(rest, 'serviceName')
        declared_tags = take(rest, 'tags')
        declared_icon = take(rest, 'iconUrl')
        type = resolve_type(declared_type, 'route type', sink) || resolve_type(read(identity, 'type'), 'type', sink)
        service_name = resolve_service_name(declared_name, read(identity, 'name'), sink)
        icon_url = resolve_icon_url(declared_icon, read(identity, 'iconUrl'), sink)
        tags = resolve_tags(declared_tags, read(identity, 'tags'), type, sink)
        extensions = resolve_product_extensions(read(rest, 'extensions'), type, identity, sink)

        result = stringify_hash(rest)
        result['serviceName'] = service_name unless service_name.nil?
        result['tags'] = tags unless tags.nil?
        result['iconUrl'] = icon_url unless icon_url.nil?
        result['extensions'] = extensions unless extensions.nil?
        result
      end

      def resolve_product_extensions(route_extensions, type, declaration, sink)
        product_id = resolve_opaque_string('productId', read(declaration, 'productId'), sink)
        manifest_hash = resolve_opaque_string('manifestHash', read(declaration, 'manifestHash'), sink)
        info = {}
        info['kind'] = type unless type.nil?
        info['product_id'] = product_id unless product_id.nil?
        info['manifest_hash'] = manifest_hash unless manifest_hash.nil?
        return nil if info.empty?

        unless route_extensions.nil?
          unless route_extensions.is_a?(Hash)
            sink.call(
              "route extensions #{show(route_extensions)} are #{type_name(route_extensions)}, " \
              'not an object; leaving them untouched and skipping the ' \
              "#{WEFT_PRODUCT_EXTENSION_KEY} declaration for this route"
            )
            return nil
          end
          return nil if has_key?(route_extensions, WEFT_PRODUCT_EXTENSION_KEY)
        end

        merged = stringify_hash(route_extensions || {})
        merged[WEFT_PRODUCT_EXTENSION_KEY] = {
          'info' => info,
          'schema' => WEFT_PRODUCT_INFO_SCHEMA
        }
        merged
      end

      def resolve_tags(route_tags, identity_tags, type, sink)
        declared = as_tag_list(route_tags, 'route tags', sink)
        declared = as_tag_list(identity_tags, 'tags', sink) if declared.nil?
        return nil if declared.nil? && type.nil?

        seller_tags = (declared || []).select do |tag|
          next true unless reserved_type_tag?(tag)

          sink.call(
            "dropping reserved tag #{show(tag)}: declare the product kind with " \
            "`type` (#{PRODUCT_TYPES.join(', ')}) on the middleware config or " \
            'on the route'
          )
          false
        end
        malformed = []
        carried = []
        carried << product_type_tag(type) unless type.nil?
        carried.concat(seller_tags)
        carried.select! do |tag|
          if tag.length <= MAX_TAG_CHARS && PRINTABLE_ASCII.match?(tag)
            true
          else
            malformed << tag
            false
          end
        end
        unless malformed.empty?
          sink.call(
            "dropping #{malformed.length} tag(s) the x402 protocol cannot carry " \
            "(max #{MAX_TAG_CHARS} printable-ASCII characters each): #{malformed.join(', ')}"
          )
        end
        deduped = carried.uniq
        if deduped.length > MAX_TAGS
          dropped = deduped.drop(MAX_TAGS)
          sink.call(
            "dropping #{dropped.length} tag(s): the x402 protocol carries #{MAX_TAGS}" \
            "#{type.nil? ? '' : ' and the declared type uses one of them'}. " \
            "Dropped: #{dropped.join(', ')}"
          )
        end
        bounded = deduped.take(MAX_TAGS)
        bounded.empty? ? nil : bounded
      end

      def resolve_service_name(route_name, identity_name, sink)
        declared = as_string('route serviceName', route_name, sink) || as_string('name', identity_name, sink)
        return nil if declared.nil?
        unless PRINTABLE_ASCII.match?(declared)
          sink.call(
            "dropping product name #{show(declared)}: the x402 protocol carries " \
            "1-#{MAX_SERVICE_NAME_CHARS} printable-ASCII characters (U+0020-U+007E)"
          )
          return nil
        end
        if declared.length > MAX_SERVICE_NAME_CHARS
          truncated = declared[0, MAX_SERVICE_NAME_CHARS]
          sink.call(
            "product name #{show(declared)} is #{declared.length} characters; the " \
            "x402 protocol carries #{MAX_SERVICE_NAME_CHARS}, so it travels as #{show(truncated)}"
          )
          return truncated
        end

        declared
      end

      def resolve_icon_url(route_icon, identity_icon, sink)
        declared = as_string('route iconUrl', route_icon, sink) || as_string('iconUrl', identity_icon, sink)
        return nil if declared.nil?
        if declared.length > MAX_ICON_URL_CHARS
          sink.call(
            "dropping iconUrl: #{declared.length} characters exceeds the " \
            "#{MAX_ICON_URL_CHARS} the x402 protocol carries"
          )
          return nil
        end
        scheme = declared[/\A([A-Za-z][A-Za-z0-9+.-]*):/, 1]&.downcase
        if scheme.nil?
          sink.call("dropping iconUrl #{show(declared)}: expected an absolute http or https URL")
          return nil
        end
        if scheme != 'http' && scheme != 'https'
          sink.call(
            "dropping iconUrl #{show(declared)}: only http and https are carried " \
            '(a dashboard renders this URL)'
          )
          return nil
        end

        declared
      end

      def resolve_type(value, field, sink)
        return nil if value.nil?
        return value if value.is_a?(String) && PRODUCT_TYPES.include?(value)

        sink.call("ignoring #{field} #{show(value)}: expected one of #{PRODUCT_TYPES.join(', ')}")
        nil
      end

      def resolve_opaque_string(field, value, sink)
        declared = as_string(field, value, sink)
        return nil if declared.nil?

        trimmed = declared.strip
        if trimmed.empty?
          sink.call("ignoring empty #{field}")
          return nil
        end
        trimmed
      end

      def as_string(field, value, sink)
        return nil if value.nil?
        return value if value.is_a?(String)

        sink.call("ignoring #{field} #{show(value)}: expected a string, got #{type_name(value)}")
        nil
      end

      def as_tag_list(value, field, sink)
        return nil if value.nil?
        unless value.is_a?(Array)
          sink.call(
            "ignoring #{field} #{show(value)}: expected an array of strings, got #{type_name(value)}"
          )
          return nil
        end

        value.select do |entry|
          next true if entry.is_a?(String)

          sink.call("dropping tag #{show(entry)}: expected a string, got #{type_name(entry)}")
          false
        end
      end

      def reserved_type_tag?(tag)
        tag.strip.downcase.start_with?(WEFT_TYPE_TAG_PREFIX)
      end

      def has_product_identity?(identity)
        %w[name type tags iconUrl productId manifestHash].any? { |key| !read(identity, key).nil? }
      end

      def has_route_identity?(routes)
        if single_route?(routes)
          !read(routes, 'type').nil?
        else
          routes.any? { |_, route| route.is_a?(Hash) && !read(route, 'type').nil? }
        end
      end

      def single_route?(routes)
        has_key?(routes, 'accepts')
      end

      def read(hash, key)
        return nil unless hash.is_a?(Hash)
        return hash[key] if hash.key?(key)
        return hash[key.to_sym] if hash.key?(key.to_sym)

        nil
      end

      def has_key?(hash, key)
        return false unless hash.is_a?(Hash)

        hash.key?(key) || hash.key?(key.to_sym)
      end

      def take(hash, key)
        value = read(hash, key)
        hash.delete(key)
        hash.delete(key.to_sym)
        value
      end

      def stringify_hash(value)
        return {} if value.nil?
        return value unless value.is_a?(Hash)

        value.each_with_object({}) do |(key, item), out|
          out[key.to_s] = item
        end
      end

      def show(value)
        JSON.generate(value)
      rescue StandardError
        type_name(value)
      end

      def type_name(value)
        return 'null' if value.nil?
        return 'an array' if value.is_a?(Array)

        "a #{js_type(value)}"
      end

      def js_type(value)
        case value
        when String then 'string'
        when Integer, Float then 'number'
        when TrueClass, FalseClass then 'boolean'
        when Hash then 'object'
        else 'object'
        end
      end
    end
  end
end
