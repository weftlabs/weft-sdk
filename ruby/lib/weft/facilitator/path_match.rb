# frozen_string_literal: true

module Weft
  module Facilitator
    # Linear scans for route compilation, path normalization, and amounts.
    # Route matching itself is a Core-equivalent regex compiled once per route.
    module PathMatch
      ROUTE_ESCAPE = '$()+.?^{|}\\'

      module_function

      def compile_route(path)
        trailing = path.end_with?('/*')
        body = trailing ? path[0..-3] : path
        source = +''
        index = 0
        while index < body.length
          char = body[index]
          if char == '['
            close = body.index(']', index + 1)
            if close && close > index + 1
              source << '[^/]+'
              index = close + 1
              next
            end
          end
          if char == ':'
            length = ident_len(body, index + 1)
            if length.positive?
              source << '[^/]+'
              index += 1 + length
              next
            end
          end
          if char == '*'
            source << '.*?'
            index += 1
            next
          end
          source << '\\' if ROUTE_ESCAPE.include?(char)
          source << char
          index += 1
        end
        source << '(?:/.*?)?' if trailing
        Regexp.new("\\A#{source}\\z", Regexp::IGNORECASE | Regexp::MULTILINE, timeout: 0.05)
      end

      def ident_len(text, start)
        return 0 if start >= text.length || !ident_start?(text[start])

        index = start + 1
        index += 1 while index < text.length && ident_cont?(text[index])
        index - start
      end

      def ident_start?(char)
        char == '_' || (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')
      end

      def ident_cont?(char)
        ident_start?(char) || (char >= '0' && char <= '9')
      end

      def split_verb(pattern)
        return ['*', pattern] unless pattern.include?(' ')

        parts = []
        token = +''
        pattern.each_char do |char|
          if whitespace?(char)
            next if token.empty?

            parts << token
            token = +''
          else
            token << char
          end
        end
        parts << token unless token.empty?
        [parts[0] || '', parts[1] || '']
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
