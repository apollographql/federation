import { assert, MultiMap } from '@apollo/federation-internals';
import { HintCodeDefinition, HintLevel, HINTS } from './hints';

const header = `---
title: Composition hints
---

When you successfully [compose](./federated-types/composition) the schemas provided by your [subgraphs](./building-supergraphs/subgraphs-overview/) into a supergraph schema, the composition process can flag potential improvements or **hints**. Hints are violations of the [GraphOS schema linter's](/graphos/delivery/schema-linter) [composition rules](/graphos/delivery/linter-rules#composition-rules). You can review them on the [Checks](/graphos/delivery/schema-checks) page in GraphOS Studio or via the [Rover CLI](/rover/).

> Composition hints only appear in GraphOS Studio and via the \`rover subgraph check\` command for graphs on [federation version \`2.4\`](/federation/federation-versions/#v24) or later. You can update a graph's version from its **Settings** page in [GraphOS Studio](https://studio.apollographql.com?referrer=docs-content).

The [\`rover subgraph check\`](/rover/commands/subgraphs#subgraph-check) command outputs rule violations with the [severity levels](/graphos/delivery/schema-linter/#setting-severity-levels) you've configured for your graph variant. The [\`rover supergraph compose\`](/rover/commands/supergraphs#supergraph-compose) command outputs rule violations for _all_ local subgraph schemas.

See below for a list of composition rules categorized by rule type. The heading for each rule is the code that GraphOS returns for the rule violation. Refer to the [rules reference page](/graphos/delivery/linter-rules) for a comprehensive list of linter rules.

### Inconsistent elements

<InconsistentCompositionRules />

### Overridden and unused elements

<OverriddenCompositionRules />

### Directives

<DirectiveCompositionRules />`;

function makeMarkdownArray(
  headers: string[],
  rows: string[][]
): string {
  const columns = headers.length;
  let out = '| ' + headers.join(' | ') + ' |\n';
  out += '|' + headers.map(_ => '---').join('|') + '|\n';
  for (const row of rows) {
    assert(row.length <= columns, `Row [${row}] has too few columns (expect ${columns} but got ${row.length})`);
    const frow = row.length === columns
      ? row
      : row.concat(new Array<string>(columns - row.length).fill(''));
    out += '| ' + frow.join(' | ') + ' |\n'
  }
  return out;
}

const byLevel = Object.values(HINTS)
  .reduce(
    (acc, def) => {
      acc.add(def.level.value, def);
      return acc;
    },
    new MultiMap<HintLevel, HintCodeDefinition>(),
  );


const rows = Object.values(HINTS).map(def => [
  '`' + def.code + '`',
  def.description,
]);

const sortRowsByCode = (r1: string[], r2: string[]) => r1[0].localeCompare(r2[0]);

rows.sort(sortRowsByCode);

const hintsSectionHeader = `The following hints might be generated during composition:`;

const hintsByLevel = [];

for (const level of [HintLevel.WARN, HintLevel.INFO, HintLevel.DEBUG]) {
  const levelName = HintLevel[level];
  const defs = byLevel.get(level);
  if (!defs) {
    continue
  }

  const rows = defs.map(def => [
    '`' + def.code + '`',
    def.description,
    '`' + levelName + '`',
  ]);
  hintsByLevel.push(`## \`${levelName}\``
    + '\n\n'
    + '<div class="sticky-table">\n\n'
    + makeMarkdownArray([ 'Code', 'Description', 'Level' ], rows)
    + '\n</div>'
  );
}

console.log(
  header + '\n\n'
  + hintsSectionHeader + '\n\n'
  + hintsByLevel.join('\n\n')
);
