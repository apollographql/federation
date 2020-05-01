pub const MAX_WIDTH: usize = 100;

/// Get the width of the terminal, limited to a maximum of MAX_WIDTH
pub fn text_width() -> Option<usize> {
    term_size::dimensions().map(|(w, _)| w.min(MAX_WIDTH))
}
