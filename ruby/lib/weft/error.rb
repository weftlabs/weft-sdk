# frozen_string_literal: true

module Weft
  # Normalized buyer API error.
  #
  # The generated OpenAPI model already owns Weft::Error. This exception uses
  # RequestError so the model and the raised error can both exist.
  class RequestError < StandardError
    attr_reader :status, :code, :request_id, :retryable, :details

    def initialize(status:, code:, message:, request_id: nil, retryable: false, details: nil)
      super(message)
      @status = status
      @code = code
      @request_id = request_id
      @retryable = retryable
      @details = details
    end
  end
end
