Gem::Specification.new do |spec|
  spec.name          = 'weft-sdk'
  spec.version       = '0.26.9'
  spec.authors       = ['Weft Labs']
  spec.summary       = 'Unified Weft SDK for the Weft API and x402 Facilitator'
  spec.license       = 'Apache-2.0'
  spec.files         = Dir['lib/**/*', 'docs/**/*', 'README.md']
  spec.required_ruby_version = '>= 3.2.0'

  spec.metadata['homepage_uri'] = 'https://github.com/weftlabs/weft-sdk'
  spec.metadata['source_code_uri'] = 'https://github.com/weftlabs/weft-sdk'

  spec.add_dependency 'typhoeus', '~> 1.0'
end
