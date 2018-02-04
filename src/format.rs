use std::default::Default;

pub(crate) struct Formatter<'a> {
    buf: String,
    style: &'a Style,
    indent: u32,
}

pub struct Style {
    indent: u32,
}

impl Default for Style {
    fn default() -> Style {
        Style {
            indent: 2,
        }
    }
}

pub(crate) trait Displayable {
    fn display(&self, f: &mut Formatter);
}

impl<'a> Formatter<'a> {
    pub fn new(style: &Style) -> Formatter {
        Formatter {
            buf: String::with_capacity(1024),
            style,
            indent: 0,
        }
    }
    pub fn indent(&mut self) {
        for _ in 0..self.indent {
            self.buf.push(' ');
        }
    }
    pub fn endline(&mut self) {
        self.buf.push('\n');
    }
    pub fn start_block(&mut self) {
        self.buf.push('{');
        self.endline();
        self.indent += self.style.indent;
    }
    pub fn end_block(&mut self) {
        self.indent = self.indent.checked_sub(self.style.indent)
            .expect("negative indent");
        self.indent();
        self.buf.push('}');
        self.endline();
    }
    pub fn margin(&mut self) {
        if self.buf.len() != 0 {
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
                '\r' | '\t' | '\u{0020}'...'\u{FFFF}' => {}
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
                    '\u{0020}'...'\u{FFFF}' => self.buf.push(c),
                    _ => write!(&mut self.buf, "\\u{:04}", c as u32).unwrap(),
                }
            }
            self.buf.push('"');
        } else {
            self.buf.push_str(r#"""""#);
            self.endline();
            self.indent += self.style.indent;
            for line in s.lines() {
                if line.trim().len() != 0 {
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
