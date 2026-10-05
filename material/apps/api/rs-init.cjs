// One-off: initiate the single-node replica set and wait for a primary.
// Transactions (which every multi-collection write uses) need one.
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/admin?directConnection=true', {
    serverSelectionTimeoutMS: 15000,
  });
  const admin = mongoose.connection.db.admin();

  try {
    const status = await admin.command({ replSetGetStatus: 1 });
    console.log('replica set already initialised:', status.set);
  } catch (err) {
    await admin.command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] },
    });
    console.log('replica set rs0 initiated');
  }

  for (let i = 0; i < 60; i += 1) {
    const status = await admin.command({ replSetGetStatus: 1 });
    if (status.myState === 1) {
      console.log('rs0 has a primary — transactions are available');
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('replica set init failed:', err.message);
  process.exit(1);
});
