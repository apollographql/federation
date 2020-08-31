# Apollo WASM Query Planner

## How to make this work

```shell script
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
cd query-planner-wasm
wasm-pack build -t nodejs --scope apollo
```

## How to test:
```shell script
wasm-pack test --node
```
