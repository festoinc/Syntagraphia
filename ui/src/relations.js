/**
 * Return every document reachable from startId through any relation.
 * Relations are treated as an undirected graph for UI highlighting: a document
 * is connected whether it is the source or target of a relation.
 */
export function getConnectedDocumentIds(relations, startId) {
  const connected = new Set([startId]);
  const adjacency = new Map();

  for (const { source_id: sourceId, target_id: targetId } of relations) {
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
    if (!adjacency.has(targetId)) adjacency.set(targetId, []);
    adjacency.get(sourceId).push(targetId);
    adjacency.get(targetId).push(sourceId);
  }

  const pending = [startId];
  while (pending.length) {
    const id = pending.pop();
    for (const neighbor of adjacency.get(id) || []) {
      if (connected.has(neighbor)) continue;
      connected.add(neighbor);
      pending.push(neighbor);
    }
  }

  return connected;
}
