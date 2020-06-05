#[macro_use]
extern crate lazy_static;

mod model;
mod serialize;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
