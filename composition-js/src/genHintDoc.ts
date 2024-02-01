import { assert, MultiMap } from '@apollo/federation-internals';
import { HintCodeDefinition, HintLevel, HINTS } from './hints';

const header = `---
title: Composition hints
---

When you successfully [compose](./federated-types/composition) the schemas provided by your [subgraphs](./building-supergraphs/subgraphs-overview/) into a supergraph schema, the composition process might output **hints** that provide additional information about the result. Hints are primarily informative and _do not_ necessarily indicate that a problem needs to be fixed.

Hints are categorized under the following levels:

* \`WARN\`: Indicates a situation that might be expected but is usually temporary and should be double-checked. Typically, composition might have needed to ignore some elements from some subgraph when creating the supergraph.
* \`INFO\`: Suggests a potentially helpful improvement or highlights a noteworthy resolution made by composition. Can otherwise be ignored.
* \`DEBUG\`: Lower-level information that provides insight into the composition. These hints are of lesser importance/impact.

Note that hints are first and foremost informative and don't necessarily correspond to a problem to be fixed.

This document lists the hints that can be generated for each level, with a description of why each is generated.
`;

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
