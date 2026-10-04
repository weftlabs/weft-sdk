# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'stringio'

require_relative '../lib/weft/sdk'

class ConformanceFacilitatorTest < Minitest::Test
  ROOT = File.expand_path('../../conformance/facilitator', __dir__)
  ADAPTER = 'rack'

  def self.cases
    @cases ||= Dir[File.join(ROOT, '*.json')].sort.flat_map do |path|
      parsed = JSON.parse(File.read(path))
      raise "#{path} must be an array of cases" unless parsed.is_a?(Array)

      parsed.map { |item| [File.basename(path), item] }
    end
  end

  def test_loads_every_facilitator_fixture
    refute_empty self.class.cases
  end

  def test_every_facilitator_case
    failures = []
    skipped = []
    self.class.cases.each do |filename, test_case|
      languages = test_case['languages']
      if languages && !languages.include?('ruby')
        skipped << "#{filename}: #{test_case['name']} (#{test_case['reason']})"
        failures << "#{filename}: #{test_case['name']} skipped without a reason" if test_case['reason'].to_s.empty?
        next
      end

      run_case(filename, test_case)
    rescue Minitest::Assertion => e
      failures << "#{filename}: #{test_case['name']}\n#{e.message}"
    end
    assert_empty skipped
    assert_empty failures, failures.join("\n\n")
  end

  private

  def run_case(filename, test_case)
    case filename
    when 'auth-headers.json' then assert_auth_headers(test_case)
    when 'declared-header.json' then assert_declared_header(test_case)
    when 'product-identity.json' then assert_product_identity(test_case)
    when 'request-extension.json' then assert_request_extension(test_case)
    when 'facilitator-url.json' then assert_facilitator_url(test_case)
    when 'settlement.json'
      reason = test_case['reason']
      assert_equal test_case['expect'], Weft::Facilitator::Settlement.facilitator_unavailable?(reason)
    when 'route-match.json'
      assert_equal(
        test_case['match'],
        Weft::Facilitator::X402.route_matches?(test_case['pattern'], test_case['method'], test_case['path']),
        test_case['name']
      )
    else
      raise "no facilitator runner for #{filename}"
    end
  end

  def assert_auth_headers(test_case)
    args = substitute(test_case['args'])
    expected = substitute(test_case['expect'])
    warnings = capture_warnings do
      headers = Weft::Facilitator::Handshake.build_auth_headers(
        args['adapter'],
        args.key?('apiKey') ? args['apiKey'] : nil,
        args['declaration']
      )
      supported = expected['supported'].dup
      if expected['declared']
        encoded = headers['supported'][Weft::Facilitator::WEFT_DECLARED_HEADER]
        refute_nil encoded
        refute_empty encoded
        supported[Weft::Facilitator::WEFT_DECLARED_HEADER] = encoded
      else
        assert_nil headers['supported'][Weft::Facilitator::WEFT_DECLARED_HEADER]
      end
      assert_equal supported, headers['supported']
      assert_nil_or_equal expected['settle'], headers['settle']
      assert_nil_or_equal expected['verify'], headers['verify']
      keys = %w[supported]
      keys << 'settle' unless expected['settle'].nil?
      keys << 'verify' unless expected['verify'].nil?
      assert_equal keys.sort, headers.keys.sort
    end
    assert_equal expected['warnings'], warnings.length
    Array(expected['absentFromLogs']).each do |secret|
      refute warnings.any? { |line| line.include?(secret) }, secret
    end
  end

  def assert_declared_header(test_case)
    expected = test_case['expect']
    warnings = capture_warnings do
      headers = Weft::Facilitator::Handshake.build_auth_headers('rack', nil, test_case['declaration'])
      encoded = headers['supported'][Weft::Facilitator::WEFT_DECLARED_HEADER]
      if expected['present']
        refute_nil encoded
        refute_match(%r{[+/=]}, encoded)
        assert_equal expected['json'], JSON.parse(Weft::Facilitator::JsonWire.base64url_decode(encoded))
        assert_equal canonical_declared(expected['json']), encoded
      else
        assert_nil encoded
      end
    end
    assert_equal expected['warningKeys'].sort, warnings.map { |line| classify_product_warning(line) }.sort
  end

  def assert_product_identity(test_case)
    routes = test_case['routes']
    expected = test_case['expect']
    warnings = capture_warnings do
      result = Weft::Facilitator::Product.apply_product_identity(routes, test_case['declaration'])
      if expected['unchanged']
        assert result.equal?(routes)
      else
        assert_equal expected['route'] || expected['routes'], result
      end
    end
    assert_equal expected['rejected'].sort, warnings.map { |line| classify_product_warning(line) }.uniq.sort
  end

  def assert_request_extension(test_case)
    key = test_case['key']
    expected = test_case['expect']
    extensions = (test_case['extensions'] || {}).dup
    extensions[key] = ->(_request) { materialize(test_case['resolved']) }
    context = {
      'paymentRequiredResponse' => { 'extensions' => extensions },
      'transportContext' => { 'request' => {} }
    }
    warnings = []
    sink = lambda do |message, _key = nil|
      warnings << "[weft] #{message}"
    end
    hook = Weft::Facilitator::Extensions.dynamic_extension(key, sink)
    shipped = hook.enrich_payment_required_response(extensions[key], context)
    if expected['dropped']
      assert_nil shipped
      assert_nil extensions[key]
      assert_equal expected['remaining'], extensions if expected.key?('remaining')
    else
      assert_equal expected['shipped'], shipped
    end
    assert_equal expected['warningKeys'].sort, warnings.map { |line| classify_extension_warning(line) }.sort
  end

  def assert_facilitator_url(test_case)
    args = test_case['args']
    previous = ENV.fetch('X402_FACILITATOR_URL', nil)
    env_url = args.dig('env', 'X402_FACILITATOR_URL')
    if env_url
      ENV['X402_FACILITATOR_URL'] = env_url
    else
      ENV.delete('X402_FACILITATOR_URL')
    end
    if test_case['fn'] == 'resolveUrl'
      assert_equal test_case['expect'], Weft::Facilitator.resolve_url(args['config'])
    elsif test_case['fn'] == 'validateUrl'
      if test_case['expectError']
        assert_raises(ArgumentError) { Weft::Facilitator.validate_url(args['url'] || '') }
      else
        Weft::Facilitator.validate_url(args['url'] || '')
      end
    else
      raise "unknown facilitator url function #{test_case['fn']}"
    end
  ensure
    if previous.nil?
      ENV.delete('X402_FACILITATOR_URL')
    else
      ENV['X402_FACILITATOR_URL'] = previous
    end
  end

  def assert_nil_or_equal(expected, actual)
    if expected.nil?
      assert_nil actual
    else
      assert_equal expected, actual
    end
  end

  def substitute(value)
    case value
    when String
      value.gsub('$ADAPTER', ADAPTER).gsub('$SDK_VERSION', Weft::SDK::VERSION)
    when Array
      value.map { |item| substitute(item) }
    when Hash
      value.transform_values { |item| substitute(item) }
    else
      value
    end
  end

  def capture_warnings
    previous = $stderr
    $stderr = StringIO.new
    yield
    $stderr.string.lines.map(&:chomp).reject(&:empty?)
  ensure
    $stderr = previous
  end

  def classify_product_warning(message)
    text = message.sub(/\A\[weft\] /, '')
    return 'name' if text.include?('route serviceName') || text.include?('product name') || text.start_with?('ignoring name')
    return 'type' if text.include?('route type') || text.start_with?('ignoring type')
    return 'tags' if text.include?('tag')
    return 'iconUrl' if text.include?('iconUrl')
    return 'productId' if text.include?('productId')
    return 'manifestHash' if text.include?('manifestHash')
    return 'dimensions' if text.include?('dimension')
    return 'extensions' if text.include?('route extensions')
    return 'route' if text.start_with?('ignoring route')

    raise "unclassified product warning: #{text}"
  end

  def classify_extension_warning(message)
    text = message.sub(/\A\[weft\] /, '')
    match = /\Aextensions\[([^\]]+)\]/.match(text)
    raise "unclassified extension warning: #{text}" unless match

    key = match[1]
    return "#{key}:over-cap" if text.include?('over the')
    return "#{key}:unserializable" if text.include?('JSON cannot carry')
    return "#{key}:threw" if text.include?('callback failed')
    return "#{key}:no-request" if text.include?('no HTTP request')
    return "#{key}:not-an-object" if text.include?('returned')

    raise "unclassified extension warning: #{text}"
  end

  def canonical_declared(json)
    payload = {}
    %w[name type tags icon_url dimensions].each do |key|
      payload[key] = json[key] if json.key?(key)
    end
    Weft::Facilitator::JsonWire.base64url_encode(Weft::Facilitator::JsonWire.generate(payload))
  end

  def materialize(value)
    return value unless value.is_a?(Hash) && value.keys == ['$fixture']

    case value['$fixture']
    when 'circular'
      circular = {}
      circular['self'] = circular
      circular
    when 'nan-field'
      { 'n' => Float::NAN }
    else
      raise "unknown fixture value #{value['$fixture']}"
    end
  end
end
