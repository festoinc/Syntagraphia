'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

async function connectedIds(relations, startId) {
  const { getConnectedDocumentIds } = await import('../ui/src/relations.js');
  return getConnectedDocumentIds(relations, startId);
}

test('relationship highlighting includes the full connected component across relation types', async () => {
  const relations = [
    { source_id: 1, target_id: 2, relation_type: 'has_spec' },
    { source_id: 1, target_id: 3, relation_type: 'has_task' },
    { source_id: 1, target_id: 4, relation_type: 'verifies' },
    { source_id: 3, target_id: 2, relation_type: 'implements' },
    { source_id: 4, target_id: 5, relation_type: 'has_task' },
  ];

  assert.deepEqual([...await connectedIds(relations, 3)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.deepEqual([...await connectedIds(relations, 4)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('relationship highlighting supports isolated documents and cycles', async () => {
  const relations = [
    { source_id: 10, target_id: 11, relation_type: 'has_task' },
    { source_id: 11, target_id: 12, relation_type: 'implements' },
    { source_id: 12, target_id: 10, relation_type: 'has_spec' },
  ];

  assert.deepEqual([...await connectedIds(relations, 10)].sort((a, b) => a - b), [10, 11, 12]);
  assert.deepEqual([...await connectedIds(relations, 99)], [99]);
});
