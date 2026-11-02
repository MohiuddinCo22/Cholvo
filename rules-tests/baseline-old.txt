import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, test } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cholvo',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'merchants/m1'), { blocked: false, phone: '01700000001' });
    await setDoc(doc(db, 'merchants/m2'), { blocked: true, phone: '01700000002' });
    await setDoc(doc(db, 'orders/CHV-AAAAAA'), { tn: 'CHV-AAAAAA', status: 'Order Received', merchantUid: 'm1' });
    await setDoc(doc(db, 'tracking/CHV-AAAAAA'), { status: 'Order Received' });
    await setDoc(doc(db, 'private/charges'), { html: 'x' });
  });
});
const guest = () => env.unauthenticatedContext().firestore();
const user = u => env.authenticatedContext(u).firestore();
const admin = () => env.authenticatedContext('adm', { email: 'admin@cholvo.com' }).firestore();
const order = (tn, extra = {}) => ({ tn, type: 'book', status: 'Order Received', merchantUid: null, createdAt: serverTimestamp(), ...extra });

test('guest can create an order', () => assertSucceeds(setDoc(doc(guest(), 'orders/CHV-BBBBBB'), order('CHV-BBBBBB'))));
test('guest can create tracking', () => assertSucceeds(setDoc(doc(guest(), 'tracking/CHV-BBBBBB'), { status: 'Order Received', updatedAt: serverTimestamp() })));
test('guest cannot create order with other status', () => assertFails(setDoc(doc(guest(), 'orders/CHV-CCCCCC'), order('CHV-CCCCCC', { status: 'Delivered' }))));
test('guest cannot read orders', () => assertFails(getDoc(doc(guest(), 'orders/CHV-AAAAAA'))));
test('tracking: public get ok, list denied', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'tracking/CHV-AAAAAA')));
  await assertFails(getDocs(collection(guest(), 'tracking')));
});
test('merchant books with own uid only', async () => {
  const m = user('m1');
  await assertSucceeds(setDoc(doc(m, 'orders/CHV-DDDDDD'), order('CHV-DDDDDD', { merchantUid: 'm1' })));
  await assertFails(setDoc(doc(m, 'orders/CHV-EEEEEE'), order('CHV-EEEEEE', { merchantUid: 'm2' })));
});
test('BASELINE (changes in Phase 1): merchant cannot read orders', () => assertFails(getDoc(doc(user('m1'), 'orders/CHV-AAAAAA'))));
test('merchant cannot update an order', () => assertFails(updateDoc(doc(user('m1'), 'orders/CHV-AAAAAA'), { status: 'Delivered' })));
test('private/charges: approved yes, blocked no, guest no', async () => {
  await assertSucceeds(getDoc(doc(user('m1'), 'private/charges')));
  await assertFails(getDoc(doc(user('m2'), 'private/charges')));
  await assertFails(getDoc(doc(guest(), 'private/charges')));
});
test('admin reads and updates orders', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'orders/CHV-AAAAAA')));
  await assertSucceeds(updateDoc(doc(admin(), 'orders/CHV-AAAAAA'), { status: 'Picked Up' }));
});
test('KNOWN GAP: order accepts arbitrary extra fields', () => assertSucceeds(setDoc(doc(guest(), 'orders/CHV-FFFFFF'), order('CHV-FFFFFF', { riderName: 'fake' }))));
test('KNOWN GAP: blocked merchant can still book', () => assertSucceeds(setDoc(doc(user('m2'), 'orders/CHV-GGGGGG'), order('CHV-GGGGGG', { merchantUid: 'm2' }))));
test('KNOWN GAP: non-merchant can book under own uid', () => assertSucceeds(setDoc(doc(user('stranger'), 'orders/CHV-HHHHHH'), order('CHV-HHHHHH', { merchantUid: 'stranger' }))));
