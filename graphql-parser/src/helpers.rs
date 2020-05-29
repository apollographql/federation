use std::marker::PhantomData;

use combine::{Parser, ConsumedResult, satisfy, StreamOnce};
use combine::error::{Tracked};
use combine::stream::easy::{Error, Errors, Info};

use crate::tokenizer::{TokenStream, Kind, Token};
use crate::position::Pos;
use crate::common::Txt;

#[derive(Debug, Clone)]
pub struct TokenMatch<'a> {
    kind: Kind,
    phantom: PhantomData<&'a u8>,
}

#[derive(Debug, Clone)]
pub struct NameMatch<'a> 
{
    phantom: PhantomData<&'a u8>,
}

#[derive(Debug, Clone)]
pub struct Value<'a> {
    kind: Kind,
    value: &'static str,
    phantom: PhantomData<&'a u8>,
}


pub fn kind<'x>(kind: Kind) -> TokenMatch<'x> {
    TokenMatch {
        kind,
        phantom: PhantomData,
    }
}

pub fn name<'a>() -> NameMatch<'a>
{
    NameMatch {
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
        error: &mut Tracked<Errors<Token<'a>, Token<'a>, Pos>>)
    {
        error.error.add_error(Error::Expected(Info::Owned(
            format!("{:?}", self.kind))));
    }
}

pub fn punct<'s>(value: &'static str) -> Value<'s> {
    Value {
        kind: Kind::Punctuator,
        value,
        phantom: PhantomData,
    }
}

pub fn ident<'s>(value: &'static str) -> Value<'s> {
    Value {
        kind: Kind::Name,
        value,
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
        error.error.add_error(Error::Expected(Info::Borrowed(self.value)));
    }
}

impl<'a> Parser for NameMatch<'a> 
{
    type Input = TokenStream<'a>;
    type Output = Txt<'a>;
    type PartialState = ();

    #[inline]
    fn parse_lazy(&mut self, input: &mut Self::Input)
        -> ConsumedResult<Self::Output, Self::Input>
    {
        satisfy(|c: Token<'a>| c.kind == Kind::Name)
            .map(|t: Token<'a>| { t.value })
            .parse_lazy(input)
    }

    fn add_error(&mut self,
        error: &mut Tracked<Errors<Token<'a>, Token<'a>, Pos>>)
    {
        error.error.add_error(Error::Expected(Info::Borrowed("Name")));
    }
}
