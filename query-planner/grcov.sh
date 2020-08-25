find ../target/ -name '*.gc*' -delete

CARGO_INCREMENTAL=0 \
RUSTFLAGS="-Zprofile -Ccodegen-units=1 -Copt-level=0 -Clink-dead-code -Coverflow-checks=off -Zpanic_abort_tests -Cpanic=abort" \
RUSTDOCFLAGS="-Cpanic=abort" \
cargo test

grcov ../target/debug/ -s . -t html --llvm --branch --ignore-not-existing -o ../target/debug/coverage/

open ../target/debug/coverage/index.html
