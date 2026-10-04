require 'json'

require_relative 'client'

module Weft
  module Facilitator
    module Fee
      DEFAULT_TTL_MS = 5 * 60 * 1000

      @cache = nil

      class << self
        def get_fee_info(client: Client.new, ttl: DEFAULT_TTL_MS)
          return @cache[:fee] if cache_valid?

          supported = client.supported
          fee = supported['fee'] || supported[:fee]
          raise 'Fee information not found in /supported response' unless fee

          validate_fee!(fee)
          normalized = {
            'amount' => fee['amount'] || fee[:amount],
            'asset' => fee['asset'] || fee[:asset],
            'network' => fee['network'] || fee[:network]
          }

          @cache = {
            fee: normalized,
            fetched_at: now_ms,
            ttl: ttl
          }
          normalized
        end

        def invalidate_fee_cache
          @cache = nil
        end

        private

        def cache_valid?
          return false unless @cache

          now_ms - @cache[:fetched_at] < @cache[:ttl]
        end

        def now_ms
          Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond)
        end

        def validate_fee!(fee)
          amount = fee['amount'] || fee[:amount]
          asset = fee['asset'] || fee[:asset]
          network = fee['network'] || fee[:network]
          raise 'Invalid fee structure: amount must be a string' unless amount.is_a?(String)
          raise 'Invalid fee structure: asset must be a string' unless asset.is_a?(String)
          raise 'Invalid fee structure: network must be a string' unless network.is_a?(String)
        end
      end
    end
  end
end
