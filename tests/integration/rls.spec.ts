/*
 * RLS integration tests — verify all 8 cross-user query combinations are rejected at the DB level.
 *
 * Prerequisites:
 *   1. Run `npm run supabase:start` to start the local Supabase instance.
 *   2. Create `.env.test.local` in the repo root (already gitignored via `.env.*.local`):
 *        SUPABASE_URL=http://127.0.0.1:54321
 *        SUPABASE_ANON_KEY=<anon key from `supabase status`>
 *        SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
 *
 * Run: npm run test:integration
 *
 * The service-role client (created with SUPABASE_SERVICE_ROLE_KEY) bypasses RLS — it is used
 * exclusively in beforeAll/afterAll for provisioning and cleanup. All assertion queries must use
 * the user-session clients (clientA, clientB) so that RLS policies actually fire.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? '';
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

const USER_A_EMAIL = 'user-a@rls-test.local';
const USER_B_EMAIL = 'user-b@rls-test.local';
const TEST_PASSWORD = 'RlsTestPass123!';

let serviceClient: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let userAId: string;
let userBId: string;
let vehicleAId: string;
let serviceRecordAId: string;

beforeAll(async () => {
  serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Clean up any leftover test users from a previous run
  const { data: existing } = await serviceClient.auth.admin.listUsers();
  for (const u of existing?.users ?? []) {
    if (u.email === USER_A_EMAIL || u.email === USER_B_EMAIL) {
      await serviceClient.auth.admin.deleteUser(u.id);
    }
  }

  // Create User A (email_confirm: true skips the confirmation email)
  const { data: aData, error: errA } = await serviceClient.auth.admin.createUser({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (errA || !aData) throw new Error(`Failed to create User A: ${errA?.message}`);
  userAId = aData.user.id;

  // Create User B
  const { data: bData, error: errB } = await serviceClient.auth.admin.createUser({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (errB || !bData) throw new Error(`Failed to create User B: ${errB?.message}`);
  userBId = bData.user.id;

  // Obtain User A session via anon client — using anon key ensures RLS is enforced on this client
  const tempA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessA, error: signInA } = await tempA.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInA || !sessA.session) throw new Error(`Failed to sign in as User A: ${signInA?.message}`);
  clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${sessA.session.access_token}` } },
  });

  // Obtain User B session
  const tempB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessB, error: signInB } = await tempB.auth.signInWithPassword({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInB || !sessB.session) throw new Error(`Failed to sign in as User B: ${signInB?.message}`);
  clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${sessB.session.access_token}` } },
  });

  // Insert User A's vehicle using clientA so auth.uid() = userAId (INSERT RLS checks this)
  const { data: vehicle, error: vehicleErr } = await clientA
    .from('vehicles')
    .insert({ user_id: userAId, make: 'Toyota', model: 'Corolla', year: 2020, engine_capacity: 2.0, fuel_type: 'gasoline' })
    .select('id')
    .single();
  if (vehicleErr || !vehicle) throw new Error(`Failed to insert vehicle: ${vehicleErr?.message}`);
  vehicleAId = vehicle.id;

  // Insert User A's service record using clientA
  const { data: record, error: recordErr } = await clientA
    .from('service_records')
    .insert({ vehicle_id: vehicleAId, user_id: userAId, service_date: '2026-01-01', mileage: 10000, label: 'Oil change' })
    .select('id')
    .single();
  if (recordErr || !record) throw new Error(`Failed to insert service record: ${recordErr?.message}`);
  serviceRecordAId = record.id;
});

afterAll(async () => {
  if (!serviceClient) return;
  // ON DELETE CASCADE removes service_records when vehicles are deleted; clean both to be safe
  if (userAId) {
    await serviceClient.from('service_records').delete().eq('user_id', userAId);
    await serviceClient.from('vehicles').delete().eq('user_id', userAId);
    await serviceClient.auth.admin.deleteUser(userAId);
  }
  if (userBId) {
    await serviceClient.from('service_records').delete().eq('user_id', userBId);
    await serviceClient.from('vehicles').delete().eq('user_id', userBId);
    await serviceClient.auth.admin.deleteUser(userBId);
  }
});

describe('vehicles table', () => {
  it('cross-user SELECT: User B cannot see User A row', async () => {
    const { data } = await clientB.from('vehicles').select().eq('id', vehicleAId);
    expect(data).toHaveLength(0);
  });

  it('cross-user INSERT: User B cannot insert row claiming User A ownership', async () => {
    const { error } = await clientB.from('vehicles').insert({
      user_id: userAId,
      make: 'Hacked',
      model: 'Car',
      year: 2020,
      engine_capacity: 1.0,
      fuel_type: 'gasoline',
    });
    expect(error).not.toBeNull();
  });

  it('cross-user UPDATE: User B update of User A row affects 0 rows', async () => {
    const { data } = await clientB
      .from('vehicles')
      .update({ make: 'Hacked' })
      .eq('id', vehicleAId)
      .select();
    expect(data).toHaveLength(0);
  });

  it('cross-user DELETE: User B delete of User A row affects 0 rows', async () => {
    const { data } = await clientB.from('vehicles').delete().eq('id', vehicleAId).select();
    expect(data).toHaveLength(0);
  });

  it('own-user SELECT: User A can see own row', async () => {
    const { data } = await clientA.from('vehicles').select().eq('id', vehicleAId);
    expect(data).toHaveLength(1);
  });

  it('own-user INSERT: User A can insert own row', async () => {
    const { error } = await clientA.from('vehicles').insert({
      user_id: userAId,
      make: 'Honda',
      model: 'Civic',
      year: 2021,
      engine_capacity: 1.5,
      fuel_type: 'gasoline',
    });
    expect(error).toBeNull();
  });
});

describe('service_records table', () => {
  it('cross-user SELECT: User B cannot see User A row', async () => {
    const { data } = await clientB.from('service_records').select().eq('id', serviceRecordAId);
    expect(data).toHaveLength(0);
  });

  it('cross-user INSERT: User B cannot insert row claiming User A ownership', async () => {
    const { error } = await clientB.from('service_records').insert({
      vehicle_id: vehicleAId,
      user_id: userAId,
      service_date: '2026-01-15',
      mileage: 15000,
      label: 'Hacked service',
    });
    expect(error).not.toBeNull();
  });

  it('cross-user UPDATE: User B update of User A row affects 0 rows', async () => {
    const { data } = await clientB
      .from('service_records')
      .update({ label: 'Hacked' })
      .eq('id', serviceRecordAId)
      .select();
    expect(data).toHaveLength(0);
  });

  it('cross-user DELETE: User B delete of User A row affects 0 rows', async () => {
    const { data } = await clientB
      .from('service_records')
      .delete()
      .eq('id', serviceRecordAId)
      .select();
    expect(data).toHaveLength(0);
  });

  it('own-user SELECT: User A can see own row', async () => {
    const { data } = await clientA.from('service_records').select().eq('id', serviceRecordAId);
    expect(data).toHaveLength(1);
  });

  it('own-user INSERT: User A can insert own row', async () => {
    const { error } = await clientA.from('service_records').insert({
      vehicle_id: vehicleAId,
      user_id: userAId,
      service_date: '2026-02-01',
      mileage: 20000,
      label: 'Tyre check',
    });
    expect(error).toBeNull();
  });
});
