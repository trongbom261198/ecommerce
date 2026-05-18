/**
 * Concurrent order stress test
 * Simulates N users buying the same product simultaneously.
 * Sets stock to 1 → fires 3 checkouts at once → expects 1 CONFIRMED, 2 CANCELLED.
 *
 * Usage:  node scripts/concurrent-order-test.mjs
 */

const BASE = 'http://localhost:8080';
const SKU_ID      = 'b1000001-0000-0000-0000-000000000001';
const PRODUCT_ID  = 'a1000001-0000-0000-0000-000000000001';
const TARGET_STOCK = 1;   // stock we want before the race

// ── ANSI colours ────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[92m',
  red:    '\x1b[91m',
  yellow: '\x1b[93m',
  blue:   '\x1b[94m',
  cyan:   '\x1b[96m',
  dim:    '\x1b[2m',
};
const col  = (c, s) => `${C[c]}${s}${C.reset}`;
const ts   = ()     => new Date().toISOString().slice(11, 23);
const log  = (label, msg, color = 'reset') =>
  console.log(`${col('dim', ts())}  ${col('bold', label.padEnd(10))}  ${col(color, msg)}`);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function login(email, password) {
  const { ok, json, status } = await api('POST', '/api/v1/auth/login', { email, password });
  if (!ok) throw new Error(`Login failed (${status}): ${JSON.stringify(json)}`);
  return { token: json.data.accessToken, userId: json.data.userId };
}

async function registerOrLogin(email, password, fullName, phone) {
  const reg = await api('POST', '/api/v1/auth/register', { email, password, fullName, phone });
  if (reg.status === 201) {
    return { token: reg.json.data.accessToken, userId: reg.json.data.userId };
  }
  // already exists — just login
  return login(email, password);
}

// ── Inventory ────────────────────────────────────────────────────────────────
async function getInventoryForSku(adminToken) {
  const { ok, json } = await api('GET', `/api/v1/inventory?page=0&size=20`, null, adminToken);
  if (!ok) return null;
  const items = json?.data?.content ?? [];
  return items.find(i => i.skuId === SKU_ID) ?? null;
}

async function setStockToTarget(adminToken, skuId, warehouseId, currentAvailable) {
  const delta = TARGET_STOCK - currentAvailable;
  if (delta === 0) return;
  const { ok, json, status } = await api('POST', '/api/v1/inventory/adjust', {
    skuId, warehouseId, quantityDelta: delta,
    reason: `[TEST] Set stock to ${TARGET_STOCK} for concurrent test`,
  }, adminToken);
  if (!ok) throw new Error(`Adjust failed (${status}): ${JSON.stringify(json)}`);
}

// ── Cart ─────────────────────────────────────────────────────────────────────
async function addToCart(token) {
  const { ok, json, status } = await api('POST', '/api/v1/cart/items', {
    skuId:       SKU_ID,
    productId:   PRODUCT_ID,
    productName: 'iPhone 15 Pro',
    skuCode:     'IP15P-128-BLK',
    variantName: '128GB Black Titanium',
    quantity:    1,
    unitPrice:   29990000,
    images:      [],
  }, token);
  if (!ok) throw new Error(`Add to cart failed (${status}): ${JSON.stringify(json)}`);
}

// ── Checkout (concurrent) ─────────────────────────────────────────────────────
async function checkout(label, token, barrier) {
  await barrier;   // wait until all threads reach this point
  const t0 = Date.now();
  const { status, json } = await api('POST', '/api/v1/orders',
    { paymentMethod: 'COD' }, token);
  const ms = Date.now() - t0;

  if (status === 201) {
    const order = json.data;
    log(label, `CHECKOUT OK  orderId=${order.id.slice(0, 8)}…  status=${order.status}  (${ms}ms)`, 'green');
    return { label, success: true, orderId: order.id, status: order.status, ms };
  } else {
    const msg = json?.message ?? JSON.stringify(json).slice(0, 120);
    log(label, `CHECKOUT FAIL  HTTP ${status}  ${msg}  (${ms}ms)`, 'red');
    return { label, success: false, httpStatus: status, msg, ms };
  }
}

// ── Poll order status ─────────────────────────────────────────────────────────
async function pollOrderStatus(orderId, token, maxWait = 8000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800));
    const { ok, json } = await api('GET', `/api/v1/orders/${orderId}`, null, token);
    if (ok && json.data?.status && json.data.status !== 'PENDING') {
      return json.data.status;
    }
  }
  return 'TIMEOUT';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + col('bold', '═'.repeat(62)));
  console.log(col('bold', '  Concurrent Order Stress Test  —  3 users, 1 stock'));
  console.log(col('bold', '═'.repeat(62)) + '\n');

  // ── 1. Admin login ──────────────────────────────────────────────────────────
  log('SETUP', 'Admin login…', 'blue');
  let adminCreds;
  try {
    adminCreds = await login('admin@ecommerce.com', 'Admin@123');
    log('SETUP', `Admin OK  userId=${adminCreds.userId}`, 'blue');
  } catch (e) {
    log('SETUP', `Admin login failed: ${e.message}`, 'red');
    log('SETUP', 'Make sure the services are running (user-service on :8081, gateway on :8080)', 'yellow');
    process.exit(1);
  }

  // ── 2. Fetch inventory & set stock ─────────────────────────────────────────
  log('SETUP', `Fetching inventory for SKU ${SKU_ID.slice(0, 8)}…`, 'blue');
  const inv = await getInventoryForSku(adminCreds.token);

  if (!inv) {
    log('SETUP', 'SKU not found in inventory. Make sure inventory-service is running and seed data is loaded.', 'yellow');
    log('SETUP', 'Skipping stock adjustment — proceeding with current state.', 'yellow');
  } else {
    log('SETUP', `Current stock: on_hand=${inv.quantityOnHand}  reserved=${inv.quantityReserved}  available=${inv.availableQuantity}  warehouse=${inv.warehouseName}`, 'cyan');
    if (inv.availableQuantity !== TARGET_STOCK) {
      log('SETUP', `Adjusting stock to ${TARGET_STOCK} (delta=${TARGET_STOCK - inv.availableQuantity})…`, 'blue');
      await setStockToTarget(adminCreds.token, inv.skuId, inv.warehouseId, inv.availableQuantity);
      log('SETUP', `Stock set to ${TARGET_STOCK}`, 'green');
    } else {
      log('SETUP', `Stock already = ${TARGET_STOCK}, no adjustment needed`, 'green');
    }
  }

  // ── 3. Register / login 3 test users ───────────────────────────────────────
  console.log();
  log('SETUP', 'Preparing 3 test users…', 'blue');
  const users = [
    { label: 'User-A', email: 'test_user_a@concurrent.test', password: 'Test@1234', fullName: 'Test User A', phone: '0900000001' },
    { label: 'User-B', email: 'test_user_b@concurrent.test', password: 'Test@1234', fullName: 'Test User B', phone: '0900000002' },
    { label: 'User-C', email: 'test_user_c@concurrent.test', password: 'Test@1234', fullName: 'Test User C', phone: '0900000003' },
  ];

  for (const u of users) {
    const creds = await registerOrLogin(u.email, u.password, u.fullName, u.phone);
    u.token  = creds.token;
    u.userId = creds.userId;
    log(u.label, `Ready  userId=${creds.userId.slice(0, 8)}…`, 'cyan');
  }

  // ── 4. Add to cart for each user ───────────────────────────────────────────
  console.log();
  log('SETUP', 'Adding iPhone 15 Pro to each cart…', 'blue');
  for (const u of users) {
    await addToCart(u.token);
    log(u.label, 'Cart ready  IP15P-128-BLK × 1', 'cyan');
  }

  // ── 5. Fire all checkouts SIMULTANEOUSLY ───────────────────────────────────
  console.log();
  log('RACE', `T-minus 1s… firing 3 concurrent checkouts!`, 'yellow');
  await new Promise(r => setTimeout(r, 1000));

  // Create a shared "go" promise — all 3 tasks await it before firing
  let go;
  const barrier = new Promise(resolve => { go = resolve; });
  const tasks = users.map(u => checkout(u.label, u.token, barrier));

  log('RACE', `T=0 — FIRE!  (${new Date().toISOString()})`, 'yellow');
  go(); // release the barrier — all 3 fire at the exact same moment

  const results = await Promise.all(tasks);

  // ── 6. Poll final order statuses ───────────────────────────────────────────
  console.log();
  log('POLL', 'Waiting for Kafka saga to settle (max 8s)…', 'blue');

  const finalStatuses = await Promise.all(results.map(async r => {
    if (!r.success || !r.orderId) return { ...r, finalStatus: r.httpStatus ? `HTTP_${r.httpStatus}` : 'FAILED' };
    const finalStatus = await pollOrderStatus(r.orderId, users.find(u => u.label === r.label).token);
    return { ...r, finalStatus };
  }));

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + col('bold', '─'.repeat(62)));
  console.log(col('bold', '  RESULTS'));
  console.log(col('bold', '─'.repeat(62)));

  let confirmed = 0, cancelled = 0;
  for (const r of finalStatuses) {
    const statusColor =
      r.finalStatus === 'CONFIRMED' ? 'green' :
      r.finalStatus === 'CANCELLED' ? 'red' : 'yellow';

    const orderInfo = r.orderId ? `orderId=${r.orderId.slice(0, 8)}…` : r.msg ?? '';
    console.log(`  ${col('bold', r.label.padEnd(10))}  ${col(statusColor, (r.finalStatus ?? 'UNKNOWN').padEnd(12))}  ${col('dim', orderInfo)}  ${col('dim', `${r.ms}ms`)}`);

    if (r.finalStatus === 'CONFIRMED') confirmed++;
    if (r.finalStatus === 'CANCELLED') cancelled++;
  }

  console.log(col('bold', '─'.repeat(62)));
  const oversellOk = confirmed <= TARGET_STOCK;
  const verdict    = oversellOk ? col('green', `No oversell — system correct`) : col('red', `OVERSELL DETECTED!`);
  console.log(`  Confirmed: ${col('green', String(confirmed))}   Cancelled: ${col('red', String(cancelled))}   ${verdict}`);
  console.log(col('bold', '═'.repeat(62)) + '\n');

  if (!oversellOk) process.exit(1);
}

main().catch(e => { console.error(col('red', `Fatal: ${e.message}`)); process.exit(1); });
