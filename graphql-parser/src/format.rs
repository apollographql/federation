//! Formatting graphql
use std::default::Default;

use crate::common::Directive;

#[derive(Debug, PartialEq)]
pub struct Formatter<'a> {
    buf: String,
    style: &'a Style,
    indent: u32,
}

/// A configuration of formatting style
///
/// Currently we only have indentation configured, other things might be
/// added later (such as minification).
#[derive(Debug, PartialEq, Clone)]
pub struct Style {
    indent: u32,
    minified: bool,
}

impl Default for Style {
    fn default() -> Style {
        Style {
            indent: 2,
            minified: false,
        }
    }
}

impl Style {
    /// Change the number of spaces used for indentation
    pub fn indent(&mut self, indent: u32) -> &mut Self {
        self.indent = indent;
        self
    }

    pub fn minified() -> Self {
        Style {
            indent: 0,
            minified: true,
        }
    }
}

pub trait Displayable {
    fn display(&self, f: &mut Formatter);
}

pub trait DisplayMinified {
    fn minified(&self) -> String;
}

impl<T: Displayable> DisplayMinified for T {
    fn minified(&self) -> String {
        let style = Style::minified();
        let mut formatter = Formatter::new(&style);
        self.display(&mut formatter);
        formatter.into_string()
    }
}

impl<'a> Formatter<'a> {
    // TODO(ran)(p2) FIXME: implement minified better... this is awful.
    pub fn is_minified(&self) -> bool {
        self.style.minified
    }

    pub fn is_minified_and_no_block_suffix(&self) -> bool {
        self.style.minified && !self.buf.ends_with('}')
    }

    pub fn new(style: &Style) -> Formatter {
        Formatter {
            buf: String::with_capacity(1024),
            style,
            indent: 0,
        }
    }

    pub fn indent(&mut self) {
        if !self.is_minified() {
            for _ in 0..self.indent {
                self.buf.push(' ');
            }
        }
    }

    pub fn space(&mut self) {
        if !self.is_minified() {
            self.buf.push(' ')
        }
    }

    pub fn endline(&mut self) {
        if !self.is_minified() {
            self.buf.push('\n')
        };
    }

    pub fn start_block(&mut self) {
        self.buf.push('{');
        self.endline();
        self.indent += self.style.indent;
    }

    pub fn end_block(&mut self) {
        self.indent = self
            .indent
            .checked_sub(self.style.indent)
            .expect("negative indent");
        self.indent();
        self.buf.push('}');
        self.endline();
    }

    pub fn margin(&mut self) {
        if !self.buf.is_empty() {
            if !self.is_minified() {
                self.endline()
            } else {
                self.buf.push(' ');
            }
        }
    }

    pub fn write(&mut self, s: &str) {
        self.buf.push_str(s);
    }

    pub fn into_string(self) -> String {
        self.buf
    }

    pub fn write_quoted(&mut self, s: &str) {
        let mut has_newline = false;
        let mut has_nonprintable = false;
        for c in s.chars() {
            match c {
                '\n' => has_newline = true,
                '\r' | '\t' | '\u{0020}'..='\u{FFFF}' => {}
                _ => has_nonprintable = true,
            }
        }
        if !has_newline || has_nonprintable {
            use std::fmt::Write;
            self.buf.push('"');
            for c in s.chars() {
                match c {
                    '\r' => self.write(r"\r"),
                    '\n' => self.write(r"\n"),
                    '\t' => self.write(r"\t"),
                    '"' => self.write("\\\""),
                    '\\' => self.write(r"\\"),
                    '\u{0020}'..='\u{FFFF}' => self.buf.push(c),
                    _ => write!(&mut self.buf, "\\u{:04}", c as u32).unwrap(),
                }
            }
            self.buf.push('"');
        } else {
            self.buf.push_str(r#"""""#);
            self.endline();
            self.indent += self.style.indent;
            for line in s.lines() {
                if !line.trim().is_empty() {
                    self.indent();
                    self.write(&line.replace(r#"""""#, r#"\""""#));
                }
                self.endline();
            }
            self.indent -= self.style.indent;
            self.indent();
            self.buf.push_str(r#"""""#);
        }
    }
}

pub(crate) fn format_directives<'a>(dirs: &[Directive<'a>], f: &mut Formatter) {
    for dir in dirs {
        f.space();
        dir.display(f);
    }
}

macro_rules! impl_display {
    ($( $typ: ident, )+) => {
        $(
            impl fmt::Display for $typ {
                fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
                    f.write_str(&to_string(self))
                }
            }
        )+
    };

    ('a $($typ: ident, )+) => {
        $(
            impl<'a> fmt::Display for $typ<'a>
            {
                fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
                    f.write_str(&to_string(self))
                }
            }
        )+
    };
}

#[cfg(test)]
mod tests {
    use crate::format::DisplayMinified;
    use crate::parse_query;

    #[test]
    fn minified() {
        let queries: Vec<&str> = vec![
            "{a{b}c}",
            "query{testing}",
            "{body{__typename nested{__typename}}test{__typename nested{__typename}}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}",
            "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}",
            "query($arg:String$arg2:Int){field(argValue:$arg){otherField field3(foo:$arg2)}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}numberOfReviews}}}",
            "query($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}"
        ];
        for query in queries {
            let parsed = parse_query(query).unwrap();
            assert_eq!(query, parsed.minified())
        }
    }
}
