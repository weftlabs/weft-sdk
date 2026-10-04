# frozen_string_literal: true

require 'json'

require_relative 'client'
require_relative 'echo'
require_relative 'extensions'
require_relative 'handshake'
require_relative 'product'
require_relative 'replay'
require_relative 'settlement'
require_relative 'x402'

module Weft
  module Facilitator
    class RackMiddleware
      UNSAFE_FAILURE_HEADERS = [
        SETTLEMENT_OVERRIDES_HEADER,
        'location',
        'set-cookie'
      ].freeze

      def initialize(app, routes: {}, config: {}, **kwargs)
        @app = app
        @config = stringify_config(config.merge(kwargs))
        @sync_on_start = !@config.key?('sync_facilitator_on_start') || @config['sync_facilitator_on_start']
        @resume = @config['resume_verified_payment']
        declaration = product_declaration(@config)
        @client = build_client(declaration)
        @server = ResourceServer.new(@client)
        Array(@config['schemes']).each do |entry|
          network = Product.read(entry, 'network')
          scheme = Product.read(entry, 'server') || entry
          @server.register(network, scheme)
        end
        @routes = Product.apply_product_identity(normalize_routes(routes), declaration)
        Extensions.register_dynamic_extensions(@server, @routes)
        @compiled = compile_routes(@routes)
        validate_registered_schemes!
        @facilitator_synced = false
        @last_failed_sync_at = 0
        @boot_sync = nil
        @sync_mutex = Mutex.new
        start_sync if @sync_on_start
      end

      def call(env)
        adapter = RackAdapter.new(env)
        context = {
          'adapter' => adapter,
          'path' => adapter.get_path,
          'method' => adapter.get_method,
          'paymentHeader' => adapter.get_header('payment-signature') || adapter.get_header('x-payment')
        }
        route = match_route(context['path'], context['method'])
        return @app.call(env) unless route

        wait_for_boot_sync
        schedule_retry if @sync_on_start && !@facilitator_synced

        payment = extract_payment(adapter)
        result = process_request(route, adapter, context, payment)
        case result['type']
        when 'no-payment-required'
          @app.call(env)
        when 'payment-error'
          send_core_response(result['response'])
        when 'payment-verified'
          run_verified(env, result, context)
        else
          @app.call(env)
        end
      end

      private

      def process_request(route, adapter, context, payment)
        resource = resource_info(route, adapter)
        options = normalize_options(route)
        requirements = options.flat_map { |option| @server.build_requirements(option, context) }
        extensions = Product.read(route, 'extensions')
        extensions = Product.stringify_hash(extensions) if extensions.is_a?(Hash)
        transport = { 'request' => context }
        required = @server.create_payment_required(
          requirements,
          resource,
          payment.nil? ? 'Payment required' : nil,
          extensions,
          transport
        )
        if payment.nil?
          return {
            'type' => 'payment-error',
            'response' => http_required_response(required, browser?(adapter))
          }
        end

        matching = match_requirements(required['accepts'], payment)
        extension_result = Echo.validate(required, payment, dynamic_fields: dynamic_fields_for(required))
        unless extension_result['valid']
          error_required = @server.create_payment_required(
            requirements, resource, extension_result['invalidReason'], extensions, transport
          )
          return { 'type' => 'payment-error', 'response' => http_required_response(error_required, false) }
        end
        if matching.nil?
          error_required = @server.create_payment_required(
            requirements, resource, 'No matching payment requirements', extensions, transport
          )
          return { 'type' => 'payment-error', 'response' => http_required_response(error_required, false) }
        end

        resumed = resume_payment(context, payment)
        if resumed
          payload = resumed['paymentPayload'] || payment
          requirements_for_pay = resumed['paymentRequirements'] || matching
          return verified_result(payload, requirements_for_pay, extensions, resumed['beforeHandlerSettlement'])
        end

        flow = @server.payment_flow(matching)
        phases = X402.payment_flow_phases(flow)
        if phases['verifyBeforeHandler']
          verify = @client.verify(payment_payload: payment, payment_requirements: matching)
          unless verify['isValid']
            error_required = @server.create_payment_required(
              requirements, resource, verify['invalidReason'], extensions, transport
            )
            return { 'type' => 'payment-error', 'response' => http_required_response(error_required, false) }
          end
        end

        before = nil
        if phases['settleBeforeHandler']
          settled = settle_phase(payment, matching, context, nil, 'before-handler')
          unless settled['success']
            return { 'type' => 'payment-error', 'response' => settled['response'] }
          end
          before = settled
        end
        verified_result(payment, matching, extensions, before)
      rescue FacilitatorUnavailableError
        { 'type' => 'payment-error', 'response' => facilitator_unavailable_response }
      rescue StandardError => e
        error_required = @server.create_payment_required(
          requirements || [],
          resource || {},
          e.message,
          extensions,
          transport
        )
        { 'type' => 'payment-error', 'response' => http_required_response(error_required, false) }
      end

      def run_verified(env, result, context)
        status, headers, body = @app.call(env)
        headers = headers.dup
        if status.to_i >= 400
          strip_unsafe_headers(headers)
          return [status, headers, body]
        end

        method = context['method']
        payload = result['paymentPayload'].dup
        payload['httpMethod'] = method.to_s.upcase
        begin
          requirements = apply_overrides(result['paymentRequirements'], headers)
        rescue ArgumentError => e
          return settlement_failure_tuple(e.message, result['paymentRequirements'])
        end
        settled = settle_phase(payload, requirements, context, headers, 'after-handler', result['beforeHandlerSettlement'])
        unless settled['success']
          if Settlement.facilitator_unavailable?(settled['errorReason'])
            return facilitator_unavailable_tuple
          end

          return send_core_response(settled['response'])
        end

        settled['headers'].each { |name, value| headers[name] = value }
        cache = Settlement.header_value(headers, 'cache-control')
        replace_header(headers, 'cache-control', Settlement.with_private_cache_control(cache))
        remove_header(headers, SETTLEMENT_OVERRIDES_HEADER)
        [status, headers, body]
      rescue FacilitatorUnavailableError
        facilitator_unavailable_tuple
      end

      def settle_phase(payload, requirements, context, response_headers, phase, before = nil)
        flow = before ? before['flow'] : @server.payment_flow(requirements)
        phases = X402.payment_flow_phases(flow)
        if phase != 'before-handler' && !phases['settleAfterHandler']
          if before
            return {
              'success' => true,
              'headers' => { 'PAYMENT-RESPONSE' => X402.encode_payment_response(before['result']) },
              'result' => before['result']
            }
          end
          return { 'success' => true, 'headers' => {}, 'result' => {} }
        end

        settle_payload = payload.dup
        settle_payload['httpMethod'] = (context['method'] || context['adapter'].get_method).to_s.upcase
        begin
          result = @client.settle(payment_payload: settle_payload, payment_requirements: requirements)
        rescue FacilitatorUnavailableError
          return {
            'success' => false,
            'errorReason' => FACILITATOR_UNAVAILABLE_ERROR,
            'response' => facilitator_unavailable_response
          }
        rescue StandardError => e
          reason = e.message
          failure = {
            'success' => false,
            'errorReason' => reason,
            'errorMessage' => reason,
            'network' => requirements['network'],
            'transaction' => ''
          }
          return failure.merge('response' => settlement_failure_response(failure))
        end

        unless result['success']
          reason = result['errorReason'] || 'Settlement failed'
          failure = result.merge('success' => false, 'errorReason' => reason)
          if Settlement.facilitator_unavailable?(reason)
            return failure.merge('response' => facilitator_unavailable_response)
          end

          return failure.merge('response' => settlement_failure_response(failure))
        end

        {
          'success' => true,
          'result' => result,
          'headers' => { 'PAYMENT-RESPONSE' => X402.encode_payment_response(result) },
          'flow' => flow
        }
      end

      def verified_result(payload, requirements, extensions, before)
        {
          'type' => 'payment-verified',
          'paymentPayload' => payload,
          'paymentRequirements' => requirements,
          'extensions' => extensions,
          'beforeHandlerSettlement' => before
        }
      end

      def resume_payment(context, payment)
        return nil unless @resume.respond_to?(:call)

        candidate = Replay.payment_resume_candidate(context.merge('paymentHeader' => context['paymentHeader']))
        return nil unless candidate

        @resume.call(context, candidate)
      end

      def http_required_response(required, browser)
        headers = {
          'PAYMENT-REQUIRED' => X402.encode_payment_required(required),
          'Cache-Control' => PAYMENT_REQUIRED_CACHE_CONTROL
        }
        if browser
          headers['Content-Type'] = 'text/html'
          return { 'status' => 402, 'headers' => headers, 'body' => FALLBACK_PAYWALL_HTML }
        end

        headers['Content-Type'] = 'application/json'
        { 'status' => 402, 'headers' => headers, 'body' => {} }
      end

      def settlement_failure_response(failure)
        headers = {
          'Content-Type' => 'application/json',
          'PAYMENT-RESPONSE' => X402.encode_payment_response(failure),
          'Cache-Control' => PAYMENT_REQUIRED_CACHE_CONTROL
        }
        { 'status' => 402, 'headers' => headers, 'body' => {} }
      end

      def facilitator_unavailable_response
        {
          'status' => 503,
          'headers' => {
            'Content-Type' => 'application/json',
            'retry-after' => '1',
            'cache-control' => Settlement.with_private_cache_control(nil)
          },
          'body' => { 'error' => 'facilitator_unavailable' }
        }
      end

      def facilitator_unavailable_tuple
        send_core_response(facilitator_unavailable_response)
      end

      def send_core_response(response)
        body = response['body']
        payload = if body.is_a?(String)
                    body
                  else
                    JsonWire.generate(body || {})
                  end
        [response['status'], response['headers'], [payload]]
      end

      def match_requirements(accepts, payment)
        accepted = payment['accepted']
        return nil unless accepted.is_a?(Hash)

        accepts.find do |required|
          core_match?(required, accepted) && extra_subset?(required['extra'], accepted['extra'])
        end
      end

      def core_match?(required, accepted)
        %w[scheme network amount asset payTo maxTimeoutSeconds].all? do |key|
          required[key] == accepted[key]
        end
      end

      def extra_subset?(required, accepted)
        return true if required.nil?
        return false unless accepted.is_a?(Hash)

        required.all? { |key, value| accepted[key] == value }
      end

      def apply_overrides(requirements, headers)
        raw = Settlement.header_value(headers, SETTLEMENT_OVERRIDES_HEADER)
        return requirements if raw.nil? || raw.empty?

        parsed = JSON.parse(raw)
        amount = parsed['amount']
        return requirements unless amount.is_a?(String)

        decimals = nil
        if amount.match?(/\A\$\d+(?:\.\d+)?\z/)
          scheme = @server.scheme_for(requirements['network'], requirements['scheme'])
          decimals = scheme_decimals(scheme, requirements)
        end
        requirements.merge('amount' => X402.resolve_settlement_override_amount(amount, requirements, decimals))
      rescue JSON::ParserError
        requirements
      end

      def scheme_decimals(scheme, requirements)
        return nil unless scheme

        fn = Product.read(scheme, 'getAssetDecimals') || Product.read(scheme, 'get_asset_decimals')
        return fn.call(requirements['asset'], requirements['network']) if fn.respond_to?(:call)
        return scheme.get_asset_decimals(requirements['asset'], requirements['network']) if scheme.respond_to?(:get_asset_decimals)

        nil
      end

      def validate_registered_schemes!
        routes = Product.single_route?(@routes) ? { '*' => @routes } : @routes
        errors = []
        routes.each do |pattern, config|
          next unless config.is_a?(Hash)

          normalize_options(config).each do |option|
            next unless option.is_a?(Hash)

            scheme_name = Product.read(option, 'scheme')
            network = Product.read(option, 'network')
            next if @server.scheme_for(network, scheme_name)

            errors << "Route \"#{pattern}\": No scheme implementation registered for \"#{scheme_name}\" on network \"#{network}\""
          end
        end
        return if errors.empty?

        raise ArgumentError, errors.join("\n")
      end

      def dynamic_fields_for(required)
        extensions = required.is_a?(Hash) ? required['extensions'] : nil
        return {} unless extensions.is_a?(Hash)

        extensions.each_key.each_with_object({}) do |key, out|
          fields = @server.dynamic_info_fields(key)
          out[key] = fields if fields
        end
      end

      def settlement_failure_tuple(message, requirements)
        failure = {
          'success' => false,
          'errorReason' => message,
          'errorMessage' => message,
          'network' => requirements.is_a?(Hash) ? requirements['network'] : nil,
          'transaction' => ''
        }
        send_core_response(settlement_failure_response(failure))
      end

      def extract_payment(adapter)
        header = adapter.get_header('payment-signature') || adapter.get_header('PAYMENT-SIGNATURE')
        return nil if header.nil? || header.empty?

        X402.decode_payment_signature(header)
      rescue StandardError => e
        warn "Failed to decode PAYMENT-SIGNATURE header: #{e.message}"
        nil
      end

      def resource_info(route, adapter)
        info = {
          'url' => Product.read(route, 'resource') || adapter.get_url,
          'description' => Product.read(route, 'description') || '',
          'mimeType' => Product.read(route, 'mimeType') || ''
        }
        service_name = Product.read(route, 'serviceName')
        tags = Product.read(route, 'tags')
        icon = Product.read(route, 'iconUrl')
        info['serviceName'] = service_name unless service_name.nil?
        info['tags'] = tags unless tags.nil?
        info['iconUrl'] = icon unless icon.nil?
        info
      end

      def normalize_options(route)
        accepts = Product.read(route, 'accepts')
        accepts.is_a?(Array) ? accepts : [accepts]
      end

      def browser?(adapter)
        adapter.get_accept_header.include?('text/html') && adapter.get_user_agent.include?('Mozilla')
      end

      def compile_routes(routes)
        normalized = Product.single_route?(routes) ? { '*' => routes } : routes
        normalized.map do |pattern, config|
          parsed = X402.parse_route_pattern(pattern.to_s)
          parsed.merge('config' => config)
        end
      end

      def match_route(path, method)
        normalized = X402.normalize_path(path)
        upper = method.to_s.upcase
        @compiled.each do |route|
          begin
            matched = route['regex'].match?(normalized)
          rescue Regexp::TimeoutError
            return route['config']
          end
          return route['config'] if matched && (route['verb'] == '*' || route['verb'] == upper)
        end
        nil
      end

      def normalize_routes(routes)
        return {} if routes.nil?
        return routes if routes.is_a?(Hash)

        {}
      end

      def product_declaration(config)
        %w[name type tags iconUrl productId manifestHash dimensions].each_with_object({}) do |key, out|
          snake = key.gsub(/([A-Z])/, '_\1').downcase
          if config.key?(key)
            out[key] = config[key]
          elsif config.key?(snake)
            out[key] = config[snake]
          end
        end
      end

      def build_client(declaration)
        facilitator = @config['facilitator'].is_a?(Hash) ? @config['facilitator'] : {}
        url = Facilitator.config_url(facilitator) || @config['facilitator_url']
        derived = Handshake.build_auth_headers(ADAPTER_NAME, @config['api_key'] || @config['apiKey'], declaration)
        seller = @config['create_auth_headers'] || facilitator['createAuthHeaders'] || facilitator['create_auth_headers']
        create_headers = lambda do
          seller_headers = seller.respond_to?(:call) ? seller.call : nil
          Facilitator.assert_path_keyed_auth_headers(seller_headers) if seller_headers
          merged = {}
          derived.each do |path, headers|
            next if headers.nil? || headers.empty?

            seller_path = seller_headers.is_a?(Hash) ? (seller_headers[path] || seller_headers[path.to_sym]) : nil
            merged[path] = Facilitator.merge_seller_wins(headers, seller_path)
          end
          if seller_headers.is_a?(Hash)
            seller_headers.each do |path, headers|
              next if merged.key?(path.to_s) || !headers.is_a?(Hash)

              merged[path.to_s] = headers
            end
          end
          merged
        end
        Client.new(url: url, create_headers: create_headers)
      end

      def stringify_config(config)
        config.each_with_object({}) do |(key, value), out|
          out[key.to_s] = value
        end
      end

      def start_sync
        @boot_sync = Thread.new { sync_once }
      end

      def wait_for_boot_sync
        thread = @boot_sync
        return unless thread

        thread.join
        @boot_sync = nil
      end

      def schedule_retry
        now = monotonic_ms
        return if now - @last_failed_sync_at < SYNC_RETRY_FLOOR_MS

        @sync_mutex.synchronize do
          return if @sync_thread&.alive?

          @sync_thread = Thread.new { sync_once }
        end
      end

      def sync_once
        @server.initialize!
        @facilitator_synced = true
      rescue StandardError => e
        @last_failed_sync_at = monotonic_ms
        warn '[weft] facilitator sync failed; payment-protected routes ' \
             'degrade until a later attempt succeeds: ' \
             "#{e.message}"
      ensure
        @sync_mutex.synchronize { @sync_thread = nil }
      end

      def monotonic_ms
        Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond)
      end

      def strip_unsafe_headers(headers)
        headers.delete_if do |name, value|
          unsafe_header?(name, value)
        end
      end

      def unsafe_header?(name, value)
        normalized = name.to_s.downcase
        return true if UNSAFE_FAILURE_HEADERS.any? { |item| item.downcase == normalized }
        return true if normalized == 'cache-control' && value.to_s.match?(/\bpublic\b/i)

        false
      end

      def replace_header(headers, name, value)
        existing = headers.keys.find { |key| key.to_s.casecmp?(name) }
        headers.delete(existing) if existing && existing != name
        headers[existing || name] = value
      end

      def remove_header(headers, name)
        headers.delete_if { |key, _| key.to_s.casecmp?(name) }
      end
    end

    class RackAdapter
      def initialize(env)
        @env = env
      end

      def get_header(name)
        rack_key = "HTTP_#{name.to_s.upcase.tr('-', '_')}"
        value = @env[rack_key] || @env[name]
        value.is_a?(Array) ? value.first : value
      end

      def get_method
        @env['REQUEST_METHOD'].to_s
      end

      def get_path
        @env['PATH_INFO'] || '/'
      end

      def get_url
        scheme = @env['rack.url_scheme'] || 'https'
        host = @env['HTTP_HOST'] || @env['SERVER_NAME'] || 'localhost'
        "#{scheme}://#{host}#{get_path}"
      end

      def get_accept_header
        get_header('Accept').to_s
      end

      def get_user_agent
        get_header('User-Agent').to_s
      end

      def get_body
        @env['weft.body']
      end
    end
  end
end
