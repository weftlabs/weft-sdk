# frozen_string_literal: true

module Weft
  # Normalized buyer API error.
  #
  # The generated OpenAPI model already owns Weft::Error. This exception uses
  # RequestError so the model and the raised error can both exist.
  #
  # `charge` says whether the failed call can have created a charge. 'none'
  # covers this call only: an earlier call under the same idempotency key can
  # still have paid. After 'possible', retry only with the same idempotency key
  # and request.
  class RequestError < StandardError
    # Codes Weft raises before it signs a payment in that call. Same list as the
    # TypeScript reference.
    PRE_SIGN_FETCH_CODES = %w[
      EXCEEDED_MAX_COST MERCHANT_RETURNED_NON_402 INSUFFICIENT_BALANCE
      DENYLISTED_RECIPIENT WALLET_ENVIRONMENT_MISMATCH UNSUPPORTED_ASSET
      INVALID_REQUEST UNKNOWN_PARAMETER INVALID_URL INVALID_MAX_COST_USD
      UNSUPPORTED_METHOD INVALID_BODY INVALID_HEADERS INVALID_IDEMPOTENCY_KEY
    ].freeze

    attr_reader :status, :code, :request_id, :retryable, :details, :charge

    # @api private
    def self.fetch_charge(status, code)
      pre_sign = PRE_SIGN_FETCH_CODES.include?(code) || code.to_s.start_with?('POLICY_VIOLATION_')
      status.between?(400, 499) && pre_sign ? 'none' : 'possible'
    end

    def initialize(status:, code:, message:, request_id: nil, retryable: false, details: nil, charge: 'possible')
      super(message)
      @status = status
      @code = code
      @request_id = request_id
      @retryable = retryable
      @details = details
      @charge = charge
    end
  end
end
