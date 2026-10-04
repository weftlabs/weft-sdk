# frozen_string_literal: true

module Weft
  module Facilitator
    # Linear route matching. No Regexp runs on a path or a pattern.
    class PathMatcher
      def self.compile(pattern)
        trailing = pattern.end_with?('/*')
        body = trailing ? pattern[0..-3] : pattern
        tokens = []
        literal = +''
        flush = lambda do
          next if literal.empty?

          tokens << [:lit, literal]
          literal = +''
        end
        i = 0
        while i < body.length
          char = body[i]
          case char
          when '\\'
            flush.call
            tokens << [:lit, '\\']
            i += 1
          when '*'
            flush.call
            tokens << [:star]
            i += 1
          when '['
            close = body.index(']', i + 1)
            if close && close > i + 1
              flush.call
              tokens << [:seg]
              i = close + 1
            else
              literal << char
              i += 1
            end
          when ':'
            length = ident_len(body, i + 1)
            if length.positive?
              flush.call
              tokens << [:seg]
              i += 1 + length
            else
              literal << char
              i += 1
            end
          else
            literal << char
            i += 1
          end
        end
        flush.call
        tokens << [:trail] if trailing
        new(tokens)
      end

      def self.ident_len(text, start)
        return 0 if start >= text.length || !ident_start?(text[start])

        index = start + 1
        index += 1 while index < text.length && ident_cont?(text[index])
        index - start
      end

      def self.ident_start?(char)
        char == '_' || (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')
      end

      def self.ident_cont?(char)
        ident_start?(char) || (char >= '0' && char <= '9')
      end

      def initialize(tokens)
        @tokens = tokens
      end

      def match?(path)
        match_from(path.to_s, 0, 0)
      end

      private

      def match_from(text, token_index, path_index)
        star_token = nil
        star_path = -1
        loop do
          token = @tokens[token_index]
          if token.nil?
            return true if path_index >= text.length
            return false unless star_token

            star_path += 1
            return false if star_path > text.length

            path_index = star_path
            token_index = star_token + 1
            next
          end

          type = token[0]
          if type == :star
            star_token = token_index
            star_path = path_index
            token_index += 1
            next
          end
          if type == :trail
            return path_index >= text.length || text[path_index] == '/'
          end

          consumed = consume(token, text, path_index)
          if consumed
            path_index += consumed
            token_index += 1
            next
          end
          return false unless star_token

          star_path += 1
          return false if star_path > text.length

          path_index = star_path
          token_index = star_token + 1
        end
      end

      def consume(token, text, path_index)
        case token[0]
        when :lit
          literal = token[1]
          return nil if path_index + literal.length > text.length
          return nil unless text[path_index, literal.length].casecmp?(literal)

          literal.length
        when :seg
          return nil if path_index >= text.length || text[path_index] == '/'

          end_at = path_index + 1
          end_at += 1 while end_at < text.length && text[end_at] != '/'
          end_at - path_index
        end
      end
    end

    module PathMatch
      module_function

      def split_verb(pattern)
        index = 0
        index += 1 while index < pattern.length && !whitespace?(pattern[index])
        return ['*', pattern] if index == pattern.length

        verb = pattern[0, index]
        index += 1 while index < pattern.length && whitespace?(pattern[index])
        rest = index < pattern.length ? pattern[index..] : ''
        stop = 0
        stop += 1 while stop < rest.length && !whitespace?(rest[stop])
        [verb, rest[0, stop]]
      end

      def whitespace?(char)
        char == ' ' || char == "\t" || char == "\n" || char == "\r" || char == "\f" || char == "\v"
      end

      def glob_match?(pattern, text)
        pattern_index = 0
        text_index = 0
        star_pattern = nil
        star_text = -1
        while text_index < text.length
          if pattern_index < pattern.length && pattern[pattern_index] == '*'
            star_pattern = pattern_index
            star_text = text_index
            pattern_index += 1
            next
          end
          if pattern_index < pattern.length && pattern[pattern_index] == text[text_index]
            pattern_index += 1
            text_index += 1
            next
          end
          return false unless star_pattern

          star_text += 1
          return false if star_text > text.length

          text_index = star_text
          pattern_index = star_pattern + 1
        end
        pattern_index += 1 while pattern_index < pattern.length && pattern[pattern_index] == '*'
        pattern_index == pattern.length
      end

      def normalize_request_path(path)
        text = path.to_s
        question = text.index('?')
        hash = text.index('#')
        cut = [question, hash].compact.min
        text = text[0, cut] if cut
        collapsed = collapse_slashes(text)
        trim_trailing_slashes_keep_root(collapsed)
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

      def trim_trailing_slashes(value)
        text = value.to_s.dup
        text.chomp!('/') while text.end_with?('/')
        text
      end

      def trim_trailing_slashes_keep_root(value)
        return value if value.length <= 1

        end_at = value.length
        end_at -= 1 while end_at > 1 && value[end_at - 1] == '/'
        end_at == value.length ? value : value[0, end_at]
      end

      def strip_leading_slashes(value)
        text = value.to_s
        index = 0
        index += 1 while index < text.length && text[index] == '/'
        index.zero? ? text : text[index..]
      end

      def decimal_amount?(text)
        return false if text.nil? || text.empty?

        index = 0
        index += 1 if text[0] == '-'
        return false if index >= text.length || !digit?(text[index])

        index += 1 while index < text.length && digit?(text[index])
        if index < text.length && text[index] == '.'
          index += 1
          index += 1 while index < text.length && digit?(text[index])
        end
        index == text.length
      end

      def digit?(char)
        char >= '0' && char <= '9'
      end

      def strip_leading_zeros(text)
        index = 0
        index += 1 while index < text.length && text[index] == '0'
        rest = text[index..]
        rest.nil? || rest.empty? ? '0' : rest
      end
    end
  end
end
