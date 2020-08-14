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
    pub fn new(style: &Style) -> Formatter {
        Formatter {
            buf: String::with_capacity(1024),
            style,
            indent: 0,
        }
    }

    pub fn is_minified(&self) -> bool {
        self.style.minified
    }

    pub fn indent(&mut self) {
        if self.is_minified() {
            return;
        }
        for _ in 0..self.indent {
            self.buf.push(' ');
        }
    }

    pub fn endline(&mut self) {
        if self.is_minified() {
            return;
        }

        self.buf.push('\n');
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
        if self.is_minified() {
            return;
        }
        if !self.buf.is_empty() {
            self.buf.push('\n');
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
        f.write(" ");
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
    use crate::format::{DisplayMinified, Displayable, Formatter, Style};
    use crate::parse_query;

    #[test]
    fn minimize() {
        let query = "query { testing }";
        let parsed = parse_query(query).unwrap();

        let style = Style::default();

        let mut formatter = Formatter::new(&style);
        parsed.display(&mut formatter);

        println!("{}", formatter.into_string());
    }

    #[test]
    fn minimize2() {
        let query = "query { testing }";
        let parsed = parse_query(query).unwrap();

        let minified = parsed.minified();

        println!("{}", minified);
    }

    #[test]
    fn minimize3() {
        let query =
            "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}";
        let parsed = parse_query(query).unwrap();
        let minified = parsed.minified();

        // println!("{}", minified);

        assert_eq!(query, minified,);
    }

    #[test]
    fn minimize4() {
        let query = "{body{__typename nested{__typename}}test{__typename nested{__typename}}}";
        let parsed = parse_query(query).unwrap();
        let minified = parsed.minified();

        // println!("{}", minified);

        assert_eq!(query, minified,);
    }
}
