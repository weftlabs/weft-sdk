# frozen_string_literal: true

require 'json'
require 'uri'

require_relative 'extensions'
require_relative 'json_wire'
require_relative 'settlement'

module Weft
  module Facilitator
    PAYMENT_FLOWS = {
      'authorization' => {
        'verifyBeforeHandler' => true,
        'settleBeforeHandler' => false,
        'settleAfterHandler' => true
      },
      'upfront' => {
        'verifyBeforeHandler' => false,
        'settleBeforeHandler' => true,
        'settleAfterHandler' => false
      },
      'escrow' => {
        'verifyBeforeHandler' => false,
        'settleBeforeHandler' => true,
        'settleAfterHandler' => true
      }
    }.freeze

    FALLBACK_PAYWALL_HTML = <<~HTML.freeze
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Required</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
            <h1>Payment Required</h1>
            <p>This resource is protected by the x402 payment protocol.</p>
            <p style="margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem;">
              <strong>Note to developers:</strong> install <code>@x402/paywall</code> to enable
              the in-browser wallet connection and payment UI. Programmatic clients should read
              the payment requirements from the 402 response headers and JSON body.
            </p>
          </div>
        </body>
      </html>
    HTML

    module X402
      module_function

      def encode_payment_required(value)
        JsonWire.encode_json(value)
      end

      def encode_payment_response(value)
        JsonWire.encode_json(value)
      end

      def decode_payment_signature(header)
        JSON.parse(JsonWire.base64_decode(header))
      end

      def parse_route_pattern(pattern)
        if pattern.include?(' ')
          verb, path = pattern.split(/\s+/, 2)
        else
          verb = '*'
          path = pattern
        end
        trailing = path.end_with?('/*')
        path_for_regex = trailing ? path[0..-3] : path
        regex_body = Regexp.escape(path_for_regex)
        regex_body = regex_body.gsub('\*', '.*?')
        regex_body = regex_body.gsub(/\\\[([^\]]+)\\\]/, '[^/]+')
        regex_body = regex_body.gsub(/:([A-Za-z_][A-Za-z0-9_]*)/, '[^/]+')
        regex_body += '(?:/.*?)?' if trailing
        {
          'verb' => verb.upcase,
          'regex' => Regexp.new("\\A#{regex_body}\\z", Regexp::IGNORECASE | Regexp::MULTILINE),
          'path' => path
        }
      end

      def normalize_path(path)
        without_query = path.to_s.split(/[?#]/, 2).first.to_s
        normalized = without_query.split('/', -1).map do |segment|
          decoded = decode_component(segment)
          decoded.gsub('/', '%2F').gsub('\\', '%5C')
        end.join('/')
        normalized.gsub(%r{/+}, '/').sub(%r{(.+?)/+\z}, '\1')
      end

      def decode_component(segment)
        segment.gsub(/%([0-9A-Fa-f]{2})/) { [Regexp.last_match(1)].pack('H*').force_encoding(Encoding::UTF_8) }
      rescue StandardError
        segment
      end

      def resolve_payment_flow(scheme, requirements)
        extra = Product.read(requirements, 'extra')
        atm = extra.is_a?(Hash) && (extra['assetTransferMethod'] || extra[:assetTransferMethod]).is_a?(String) ?
                (extra['assetTransferMethod'] || extra[:assetTransferMethod]) :
                (Product.read(scheme, 'defaultAssetTransferMethod') || 'authorization')
        flows = Product.read(scheme, 'paymentFlows') || {}
        config = flows[atm] || flows[atm.to_sym]
        unless config.is_a?(Hash)
          raise ArgumentError,
                "[x402] Scheme \"#{Product.read(scheme, 'scheme')}\" does not support assetTransferMethod \"#{atm}\"."
        end

        supported = Product.read(config, 'supported') || []
        default_flow = Product.read(config, 'default')
        requested = extra.is_a?(Hash) ? (extra['paymentFlow'] || extra[:paymentFlow]) : nil
        flow = requested.nil? ? default_flow : requested
        unless supported.include?(flow)
          raise ArgumentError, "[x402] Unsupported paymentFlow \"#{flow}\"."
        end

        { 'assetTransferMethod' => atm, 'paymentFlow' => flow }
      end

      def apply_payment_flow_wire_extra(extra, resolved)
        next_extra = Product.stringify_hash(extra || {})
        if resolved['assetTransferMethod'] == 'default' || next_extra['assetTransferMethod'] == 'default'
          next_extra.delete('assetTransferMethod')
        end
        next_extra['paymentFlow'] = resolved['paymentFlow'] unless resolved['paymentFlow'] == 'authorization'
        next_extra
      end

      def payment_flow_phases(flow)
        phases = PAYMENT_FLOWS[flow.to_s]
        raise ArgumentError, "[x402] Unknown payment flow \"#{flow}\"." unless phases

        phases
      end

      def convert_to_token_amount(decimal_amount, decimals)
        raise ArgumentError, "Invalid amount: #{decimal_amount}" if /[eE]/.match?(decimal_amount)
        raise ArgumentError, "Invalid amount: #{decimal_amount}" unless /\A-?\d+\.?\d*\z/.match?(decimal_amount)

        int_part, dec_part = decimal_amount.split('.', 2)
        padded = (dec_part || '').ljust(decimals, '0')[0, decimals]
        (int_part + padded).sub(/\A0+/, '').then { |text| text.empty? ? '0' : text }
      end

      def resolve_settlement_override_amount(raw_amount, requirements, decimals)
        if (match = raw_amount.match(/\A(\d+(?:\.\d{0,2})?)%\z/))
          int_part, dec_part = match[1].split('.', 2)
          scaled = (int_part.to_i * 100) + dec_part.to_s.ljust(2, '0')[0, 2].to_i
          base = requirements['amount'].to_i
          return ((base * scaled) / 10_000).to_s
        end
        if (match = raw_amount.match(/\A\$(\d+(?:\.\d+)?)\z/))
          if decimals.nil?
            raise ArgumentError,
                  "Cannot convert dollar settlement override \"#{raw_amount}\" to atomic units: " \
                  'asset decimals are unknown. Pass an atomic amount or register the asset.'
          end
          return convert_to_token_amount(match[1], decimals)
        end

        raw_amount
      end
    end

    class ResourceServer
      def initialize(client)
        @client = client
        @schemes = {}
        @kinds = []
        @extensions = {}
      end

      attr_reader :client

      def register(network, scheme)
        @schemes[network] = scheme
      end

      def register_extension(extension)
        key = extension.respond_to?(:key) ? extension.key : extension[:key]
        @extensions[key] = extension
      end

      def record_supported(body)
        @kinds = body.is_a?(Hash) ? (body['kinds'] || []) : []
      end

      def initialize!
        record_supported(@client.supported)
      end

      def scheme_for(network, scheme_name)
        registered = @schemes[network]
        return nil unless registered
        return registered if Product.read(registered, 'scheme') == scheme_name
        return registered[scheme_name] if registered.is_a?(Hash)

        nil
      end

      def supported_kind?(network, scheme_name)
        @kinds.any? do |kind|
          kind['scheme'] == scheme_name && kind['network'] == network && kind['x402Version'] == 2
        end
      end

      def build_requirements(option, _context)
        scheme_name = Product.read(option, 'scheme')
        network = Product.read(option, 'network')
        scheme = scheme_for(network, scheme_name)
        unless scheme
          warn "No server implementation registered for scheme: #{scheme_name}, network: #{network}"
          return []
        end
        unless supported_kind?(network, scheme_name)
          raise StandardError,
                "Facilitator does not support #{scheme_name} on #{network}. " \
                'Make sure to call initialize() to fetch supported kinds from facilitators.'
        end

        price = Product.read(option, 'price')
        price = price.call(_context) if price.respond_to?(:call)
        pay_to = Product.read(option, 'payTo')
        pay_to = pay_to.call(_context) if pay_to.respond_to?(:call)
        parsed = call_scheme(scheme, 'parsePrice', price, network)
        parsed = Product.stringify_hash(parsed)
        extra = {}
        extra.merge!(Product.stringify_hash(parsed['extra'])) if parsed['extra'].is_a?(Hash)
        extra.merge!(Product.stringify_hash(Product.read(option, 'extra'))) if Product.read(option, 'extra').is_a?(Hash)
        requirement = {
          'scheme' => scheme_name,
          'network' => network,
          'amount' => parsed['amount'],
          'asset' => parsed['asset'],
          'payTo' => pay_to,
          'maxTimeoutSeconds' => Product.read(option, 'maxTimeoutSeconds') || 300,
          'extra' => extra
        }
        enhanced = call_scheme(scheme, 'enhancePaymentRequirements', requirement, nil, [])
        requirement = Product.stringify_hash(enhanced || requirement)
        resolved = X402.resolve_payment_flow(scheme, requirement)
        requirement['extra'] = X402.apply_payment_flow_wire_extra(requirement['extra'], resolved)
        [requirement]
      end

      def create_payment_required(requirements, resource_info, error, extensions, transport_context)
        accepts = requirements.map do |item|
          copy = Product.stringify_hash(item)
          copy['extra'] = Product.stringify_hash(copy['extra']) if copy['extra'].is_a?(Hash)
          copy
        end
        response = {
          'x402Version' => 2,
          'resource' => resource_info,
          'accepts' => accepts
        }
        response['error'] = error unless error.nil?
        # Match JSON.stringify key order: x402Version, error, resource, accepts, extensions.
        response = reorder_required(response, error)
        if extensions.is_a?(Hash) && !extensions.empty?
          response['extensions'] = extensions
        end
        enrich_extensions(response, transport_context)
        response
      end

      def payment_flow(requirements)
        scheme = scheme_for(requirements['network'], requirements['scheme'])
        raise ArgumentError, "[x402] No server implementation registered for scheme: #{requirements['scheme']}" unless scheme

        X402.resolve_payment_flow(scheme, requirements)['paymentFlow']
      end

      private

      def reorder_required(response, error)
        ordered = { 'x402Version' => response['x402Version'] }
        ordered['error'] = error unless error.nil?
        ordered['resource'] = response['resource']
        ordered['accepts'] = response['accepts']
        ordered
      end

      def enrich_extensions(response, transport_context)
        extensions = response['extensions']
        return unless extensions.is_a?(Hash)

        extensions.each_key do |key|
          hook = @extensions[key] || @extensions[key.to_s]
          next unless hook.respond_to?(:enrich_payment_required_response)

          context = {
            'paymentRequiredResponse' => response,
            'transportContext' => transport_context
          }
          shipped = hook.enrich_payment_required_response(extensions[key], context)
          extensions[key] = shipped unless shipped.nil?
        end
      end

      def call_scheme(scheme, name, *args)
        fn = Product.read(scheme, name) || Product.read(scheme, underscore(name))
        return fn.call(*args) if fn.respond_to?(:call)
        return scheme.public_send(name, *args) if scheme.respond_to?(name)
        return scheme.public_send(underscore(name), *args) if scheme.respond_to?(underscore(name))

        args.first
      end

      def underscore(name)
        name.gsub(/([A-Z])/) { "_#{Regexp.last_match(1).downcase}" }
      end
    end
  end
end
