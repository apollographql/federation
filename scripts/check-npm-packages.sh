#!/usr/bin/env bash -v -e

for package in 'gateway' 'composition' 'subgraph' 'query-planner' 'query-graphs' 'federation-internals' 'federation';
  do
    echo "@apollo/$package"
    npm view "@apollo/$package" dist-tags
  done
