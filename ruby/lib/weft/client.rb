# frozen_string_literal: true

require 'json'

require_relative 'error'
require_relative 'generated'

module Weft
  # Buyer façade over the generated API client.
  class Client
    def initialize(api_key: nil, access_token: nil, base_url: 'https://weft.network')
      if !api_key.nil? && !access_token.nil?
        raise ArgumentError, 'api_key and access_token are mutually exclusive'
      end

      raw = api_key.nil? ? access_token : api_key
      credential = raw.is_a?(String) ? raw.strip : ''
      if credential.empty?
        raise ArgumentError, credential_error(api_key, access_token)
      end

      configuration = Configuration.new
      apply_base_url(configuration, base_url)
      configuration.access_token = credential
      @api_client = ApiClient.new(configuration)
      @account = AccountApi.new(@api_client)
      @balance = BalanceApi.new(@api_client)
      @search = SearchApi.new(@api_client)
      @fetch = FetchApi.new(@api_client)
      @purchases = PurchasesApi.new(@api_client)
    end

    def me
      call { @account.get_me }
    end

    def balance
      call { @balance.get_balance }
    end

    def search(query:, max_results: nil, filters: nil)
      request = SearchRequest.new(query: query)
      if max_results.nil?
        request.remove_instance_variable(:@max_results)
      else
        request.max_results = max_results
      end
      request.filters = search_filters(filters) unless filters.nil?
      call { @search.search(request) }
    end

    def fetch(url:, max_cost_usd:, idempotency_key:, method: nil, body: nil, headers: nil,
              search_id: nil, operation_id: nil, access_method_id: nil)
      raise ArgumentError, 'max_cost_usd is required' if max_cost_usd.to_s.strip.empty?
      raise ArgumentError, 'idempotency_key is required' if idempotency_key.to_s.strip.empty?

      fields = {
        url: url,
        max_cost_usd: max_cost_usd,
        method: method.nil? ? nil : method.to_s.upcase
      }
      fields[:body] = fetch_body(body) unless body.nil?
      fields[:headers] = headers.transform_keys(&:to_s) unless headers.nil?
      fields[:search_id] = search_id unless search_id.nil?
      fields[:operation_id] = operation_id unless operation_id.nil?
      fields[:access_method_id] = access_method_id unless access_method_id.nil?
      request = FetchRequest.new(fields)
      call { @fetch.fetch(request, idempotency_key: idempotency_key) }
    end

    def purchases(page: nil, per_page: nil)
      call { @purchases.list_purchases(page: page, per_page: per_page) }
    end

    def purchase(id)
      call { @purchases.get_purchase(id) }
    end

    private

    def call
      yield
    rescue ApiError => e
      raise normalize_api_error(e)
    end

    def credential_error(api_key, access_token)
      return 'api_key is required' unless api_key.nil?
      return 'access_token is required' unless access_token.nil?

      'api_key or access_token is required'
    end

    def apply_base_url(configuration, base_url)
      stripped = trim_trailing_slashes(base_url.to_s)
      uri = URI.parse(stripped)
      configuration.scheme = uri.scheme || 'https'
      configuration.host = uri.host || trim_trailing_slashes(stripped)
      path = collapse_slashes(uri.path.to_s)
      path = trim_trailing_slashes(path)
      path = strip_leading_slashes(path)
      configuration.base_path = path
    end

    def trim_trailing_slashes(value)
      text = value.dup
      text.chomp!('/') while text.end_with?('/')
      text
    end

    def strip_leading_slashes(value)
      index = 0
      index += 1 while index < value.length && value[index] == '/'
      index.zero? ? value : value[index..]
    end

    def collapse_slashes(value)
      out = +''
      previous_slash = false
      value.each_char do |char|
        if char == '/'
          out << '/' unless previous_slash
          previous_slash = true
        else
          out << char
          previous_slash = false
        end
      end
      out
    end

    def search_filters(value)
      mapped = map_filters(value)
      spec = SearchFilterSpec.new(mapped)
      spec.include_unknown_prices = nil unless mapped.key?(:include_unknown_prices)
      spec
    end

    def map_filters(value)
      table = {
        'price' => :price,
        'priceAtomic' => :price_atomic,
        'type' => :type,
        'protocol' => :protocol,
        'category' => :category,
        'method' => :method,
        'executionMode' => :execution_mode,
        'weftFetchCompatible' => :weft_fetch_compatible,
        'includeUnknownPrices' => :include_unknown_prices
      }
      nested = %i[price price_atomic type protocol category method execution_mode]
      operators = {
        'lte' => :lte,
        'gte' => :gte,
        'eq' => :eq,
        'in' => :in,
        'rangeGte' => :range_gte,
        'rangeLte' => :range_lte
      }
      mapped = map_keys(value, table)
      nested.each do |name|
        child = mapped[name]
        next unless child.is_a?(Hash)

        mapped[name] = map_keys(child, operators)
      end
      mapped
    end

    def map_keys(source, table)
      source.each_with_object({}) do |(key, item), out|
        mapped = table[key.to_s] || table[key.to_sym]
        raise ArgumentError, "unmapped field #{key}" if mapped.nil?

        out[mapped] = item
      end
    end

    def fetch_body(value)
      return value if value.is_a?(String)

      JSON.generate(value)
    end

    def normalize_api_error(error)
      if error.code.to_i.zero? && !error.response_body
        cause = error.instance_variable_get(:@message).to_s
        cause = 'connection reset' if cause.empty?
        return RequestError.new(
          status: 0,
          code: 'NETWORK_ERROR',
          message: "Network failure before a Weft API response: #{cause}",
          request_id: nil,
          retryable: true,
          details: nil
        )
      end

      details = parse_details(error.response_body)
      body = details.is_a?(Hash) ? details : nil
      nested = body && body['error'].is_a?(Hash) ? body['error'] : nil
      status = error.code.to_i
      RequestError.new(
        status: status,
        code: nested&.[]('code') || body&.[]('code') || (body && body['error'].is_a?(String) ? body['error'] : "HTTP_#{status}"),
        message: nested&.[]('message') || body&.[]('message') || "Weft API returned HTTP #{status}",
        request_id: nested&.[]('request_id') || body&.[]('request_id') || header_request_id(error),
        retryable: status == 429 || status >= 500,
        details: details
      )
    end

    def parse_details(body)
      return nil if body.nil? || body.empty?

      parsed = JSON.parse(body)
      parsed.is_a?(Hash) || parsed.is_a?(Array) ? parsed : nil
    rescue JSON::ParserError
      nil
    end

    def header_request_id(error)
      headers = error.response_headers
      return nil unless headers.respond_to?(:each)

      pair = headers.find { |name, _| name.to_s.casecmp?('x-request-id') }
      value = pair&.last
      value.is_a?(Array) ? value.first : value
    end
  end
end
