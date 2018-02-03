use std::marker::PhantomData;

use position::Pos;
use combine::{Parser, ConsumedResult, satisfy, StreamOnce};
use combine::combinator::{SkipMany, Or};
use combine::error::{ParseError, Tracked};
use combine::stream::easy::{Error, Info};

use tokenizer::{TokenStream, Kind, Token};


#[derive(Clone)]
pub struct TokenMatch<'a> {
    kind: Kind,
    phantom: PhantomData<&'a u8>,
}

#[derive(Clone)]
pub struct Value<'a> {
    kind: Kind,
    value: &'static str,
    phantom: PhantomData<&'a u8>,
}


pub fn kind<'x>(kind: Kind) -> TokenMatch<'x> {
    TokenMatch {
        kind: kind,
        phantom: PhantomData,
    }
}

impl<'a> Parser for TokenMatch<'a> {
    type Input = TokenStream<'a>;
    type Output = Token<'a>;
    type PartialState = ();

    #[inline]
    fn parse_lazy(&mut self, input: &mut Self::Input)
        -> ConsumedResult<Self::Output, Self::Input>
    {
        satisfy(|c: Token<'a>| c.kind == self.kind).parse_lazy(input)
    }

    fn add_error(&mut self,
        error: &mut Tracked<<Self::Input as StreamOnce>::Error>)
    {
        error.error = Error::Expected(Info::Owned(
            format!("{:?}", self.kind)));
    }
}

pub fn punct<'x>(value: &'static str) -> Value<'x> {
    Value {
        kind: Kind::Punctuator,
        value: value,
        phantom: PhantomData,
    }
}

impl<'a> Parser for Value<'a> {
    type Input = TokenStream<'a>;
    type Output = Token<'a>;
    type PartialState = ();

    #[inline]
    fn parse_lazy(&mut self, input: &mut Self::Input)
        -> ConsumedResult<Self::Output, Self::Input>
    {
        satisfy(|c: Token<'a>| {
            c.kind == self.kind && c.value == self.value
        }).parse_lazy(input)
    }
    fn add_error(&mut self,
        error: &mut Tracked<<Self::Input as StreamOnce>::Error>)
    {
        error.error = Error::Expected(Info::Borrowed(self.value));
    }
}
