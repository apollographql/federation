use std::fmt;

use combine::{StreamOnce, Positioned};
use combine::primitives::{UnexpectedParse, StreamError};
use position::Pos;


#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Kind {
    Punctuator,
    Name,
    IntValue,
    FloatValue,
    StringValue,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct Token<'a> {
    pub kind: Kind,
    pub value: &'a str,
}

#[derive(Clone)]
pub struct TokenStream<'a> {
    buf: &'a str,
    position: Pos,
    off: usize,
}

impl<'a> StreamOnce for TokenStream<'a> {
    type Item = Token<'a>;
    type Range = Token<'a>;
    type Position = Pos;
    type Error = UnexpectedParse;

    fn uncons<E>(&mut self) -> Result<Self::Item, E>
        where E: StreamError<Self::Item, Self::Range>
    {
        use self::Kind::*;
        let (kind, len) = {
            let mut iter = self.buf[self.off..].chars();
            loop {
                let cur_char = match iter.next() {
                    Some(x) => x,
                    None => return Err(E::end_of_input()),
                };
                match cur_char {
                    '!' | '$' | ':' | '=' | '@' | '|' |
                    '(' | ')' | '[' | ']' | '{' | '}' => {
                        break (Punctuator, 1);
                    }
                    // TODO(tailhook) punctuator '...'
                    _ => return Err(E::unexpected_message(
                        format_args!("unexpected character {:?}", cur_char))),
                }
            }
        };
        let value = &self.buf[..len];
        self.update_position(len);
        self.skip_whitespace();
        Ok(Token { kind, value })
    }
}

impl<'a> Positioned for TokenStream<'a> {
    fn position(&self) -> Self::Position {
        self.position
    }
}

impl<'a> TokenStream<'a> {
    pub fn new(s: &str) -> TokenStream {
        let mut me = TokenStream {
            buf: s,
            position: Pos { line: 1, column: 1 },
            off: 0,
        };
        me.skip_whitespace();
        return me;
    }
    fn skip_whitespace(&mut self) {
        let num = {
            let mut iter = self.buf[self.off..].char_indices();
            loop {
                let (idx, cur_char) = match iter.next() {
                    Some(pair) => pair,
                    None => break (self.buf.len() - self.off),
                };
                match cur_char {
                    '\u{feff}' | '\t' | ' ' |
                    '\r' | '\n' |
                    // comma is also entirely ignored in spec
                    ',' => continue,
                    //comment
                    '#' => {
                        while let Some((_, cur_char)) = iter.next() {
                            if cur_char == '\r' || cur_char == '\n' {
                                break;
                            }
                        }
                        continue;
                    }
                    _ => break idx,
                }
            }
        };
        if num > 0 {
            self.update_position(num);
        }
    }
    fn update_position(&mut self, len: usize) {
        let val = &self.buf[self.off..][..len];
        self.off += len;
        let lines = val.as_bytes().iter().filter(|&&x| x == b'\n').count();
        self.position.line += lines;
        if lines > 0 {
            let line_offset = val.rfind('\n').unwrap()+1;
            let num = val[line_offset..].chars().count();
            self.position.column = num+1;
        } else {
            let num = val.chars().count();
            self.position.column += num;
        }
    }
}

impl<'a> fmt::Display for Token<'a> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}[{:?}]", self.value, self.kind)
    }
}

#[cfg(test)]
mod test {
    use super::{Kind, TokenStream};
    use super::Kind::*;

    use combine::{StreamOnce, Positioned};
    use combine::primitives::UnexpectedParse;

    fn tok_str(s: &str) -> Vec<&str> {
        let mut r = Vec::new();
        let mut s = TokenStream::new(s);
        loop {
            match s.uncons::<UnexpectedParse>() {
                Ok(x) => r.push(x.value),
                Err(UnexpectedParse::Eoi) => break,
                Err(e) => panic!("Parse error at: {}, {}", s.position(), e),
            }
        }
        return r;
    }
    fn tok_typ(s: &str) -> Vec<Kind> {
        let mut r = Vec::new();
        let mut s = TokenStream::new(s);
        loop {
            match s.uncons::<UnexpectedParse>() {
                Ok(x) => r.push(x.kind),
                Err(UnexpectedParse::Eoi) => break,
                Err(e) => panic!("Parse error at: {}, {}", s.position(), e),
            }
        }
        return r;
    }

    #[test]
    fn comments_and_commas() {
        assert_eq!(tok_str("# hello { world }"), &[] as &[&str]);
        assert_eq!(tok_str("# x\n,,,"), &[] as &[&str]);
        assert_eq!(tok_str(", ,,  ,,,  # x"), &[] as &[&str]);
    }

    #[test]
    fn simple() {
        assert_eq!(tok_str("a { b }"), ["a", "{", "b", "}"]);
        assert_eq!(tok_typ("a { b }"), [Name, Punctuator, Name, Punctuator]);
    }

    #[test]
    fn query() {
        assert_eq!(tok_str("query Query {
            object { field }
        }"), ["query", "Query", "{", "object", "{", "field", "}", "}"]);
    }
}
