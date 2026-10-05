/**
 * Initialises the single-node replica set `rs0`.
 *
 * Mongo needs a replica set for multi-document transactions, which every
 * multi-collection write in this app depends on (§1). One node is enough
 * locally and on a single VPS; add members here when you move to a cluster.
 *
 * Mounted into /docker-entrypoint-initdb.d, so it runs once on a fresh volume.
 */
try {
  rs.status();
  print('replica set already initialised');
} catch (err) {
  print('initialising replica set rs0');
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}
