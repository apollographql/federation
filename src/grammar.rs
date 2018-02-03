use tokenizer::TokenStream;



pub fn parse_query(s: &str) -> Result<Document, Error> {
    let tokens = TokenStream::new(s);
    many1(parse(definition))
    .map(|d| Document { definitions: d })
    .parse(token)
}
