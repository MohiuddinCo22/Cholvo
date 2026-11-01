import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, test } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

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
    await setDoc(doc(db, 'merchants/m3'), { blocked: false, phone: '01700000003' });
    await setDoc(doc(db, 'orders/CHV-AAAAAA'), { tn: 'CHV-AAAAAA', status: 'Order Received', merchantUid: 'm1' });
    await setDoc(doc(db, 'orders/CHV-MMMMMM'), { tn: 'CHV-MMMMMM', status: 'Order Received', merchantUid: 'm3' });
    await setDoc(doc(db, 'tracking/CHV-AAAAAA'), { status: 'Order Received' });
    await setDoc(doc(db, 'private/charges'), { html: 'x' });
  });
});
const guest = () => env.unauthenticatedContext().firestore();
const user = u => env.authenticatedContext(u).firestore();
const admin = () => env.authenticatedContext('adm', { email: 'admin@cholvo.com' }).firestore();

const bookFields = () => ({ vendor: 'Shop', phone: '01711111111', pickup: 'A', drop: 'B', customerName: 'C',
  customerPhone: '01722222222', ptype: 'Parcel', cod: 0, date: '2026-11-01', later: '' });
const orderDoc = (tn, extra = {}) => ({ ...bookFields(), tn, type: 'book', status: 'Order Received',
  merchantUid: null, createdAt: serverTimestamp(), ...extra });
const trackDoc = () => ({ status: 'Order Received', updatedAt: serverTimestamp() });
const book = (db, tn, extra = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, 'orders/' + tn), orderDoc(tn, extra));
  b.set(doc(db, 'tracking/' + tn), trackDoc());
  return b.commit();
};

// ---- booking by guests
test('guest booking (order + tracking) works', () => assertSucceeds(book(guest(), 'CHV-BBBBBB')));
test('guest "order anything" works', () => {
  const g = guest(), b = writeBatch(g);
  b.set(doc(g, 'orders/CHV-NNNNNN'), { tn: 'CHV-NNNNNN', type: 'order', status: 'Order Received', merchantUid: null,
    createdAt: serverTimestamp(), name: 'N', phone: '01711111111', addr: 'X', product: 'P', from: 'F' });
  b.set(doc(g, 'tracking/CHV-NNNNNN'), trackDoc());
  return assertSucceeds(b.commit());
});
test('extra/rider fields are rejected', () => assertFails(book(guest(), 'CHV-CCCCCC', { riderName: 'fake' })));
test('backdated createdAt is rejected', () =>
  assertFails(book(guest(), 'CHV-DDDDDD', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) })));
test('other status is rejected', () => assertFails(book(guest(), 'CHV-EEEEEE', { status: 'Delivered' })));
test('bad tracking number format is rejected', async () => {
  await assertFails(book(guest(), 'CHV-abc'));
  await assertFails(book(guest(), 'CHV-IIIIII'));
});
test('tracking alone (no order) is rejected', () =>
  assertFails(setDoc(doc(guest(), 'tracking/CHV-FFFFFF'), trackDoc())));
test('guest cannot claim a merchant uid', () => assertFails(book(guest(), 'CHV-LLLLLL', { merchantUid: 'm1' })));

// ---- booking by merchants
test('approved merchant books under own uid', () => assertSucceeds(book(user('m1'), 'CHV-GGGGGG', { merchantUid: 'm1' })));
test('merchant cannot book under another uid', () => assertFails(book(user('m1'), 'CHV-JJJJJJ', { merchantUid: 'm3' })));
test('blocked merchant cannot book', () => assertFails(book(user('m2'), 'CHV-HHHHHH', { merchantUid: 'm2' })));
test('non-merchant account cannot book under own uid', () =>
  assertFails(book(user('stranger'), 'CHV-KKKKKK', { merchantUid: 'stranger' })));

// ---- reading orders
test('guest cannot read orders', () => assertFails(getDoc(doc(guest(), 'orders/CHV-AAAAAA'))));
test('merchant reads own order', () => assertSucceeds(getDoc(doc(user('m1'), 'orders/CHV-AAAAAA'))));
test('merchant cannot read another merchant order', () => assertFails(getDoc(doc(user('m1'), 'orders/CHV-MMMMMM'))));
test('merchant own-parcels query works', () =>
  assertSucceeds(getDocs(query(collection(user('m1'), 'orders'), where('merchantUid', '==', 'm1')))));
test('merchant unfiltered or foreign query is rejected', async () => {
  await assertFails(getDocs(collection(user('m1'), 'orders')));
  await assertFails(getDocs(query(collection(user('m1'), 'orders'), where('merchantUid', '==', 'm3'))));
});
test('blocked merchant and guest queries are rejected', async () => {
  await assertFails(getDocs(query(collection(user('m2'), 'orders'), where('merchantUid', '==', 'm2'))));
  await assertFails(getDocs(query(collection(guest(), 'orders'), where('merchantUid', '==', 'm1'))));
});

// ---- merchants cannot change orders (rider info is admin only)
test('merchant cannot update or delete an order', async () => {
  await assertFails(updateDoc(doc(user('m1'), 'orders/CHV-AAAAAA'), { status: 'Delivered' }));
  await assertFails(updateDoc(doc(user('m1'), 'orders/CHV-AAAAAA'), { riderName: 'x' }));
  await assertFails(deleteDoc(doc(user('m1'), 'orders/CHV-AAAAAA')));
});

// ---- tracking
test('tracking: public get ok, list denied, merchant cannot update', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'tracking/CHV-AAAAAA')));
  await assertFails(getDocs(collection(guest(), 'tracking')));
  await assertFails(updateDoc(doc(user('m1'), 'tracking/CHV-AAAAAA'), { status: 'Delivered' }));
});

// ---- admin
test('admin can read, list and update orders and tracking', async () => {
  const a = admin();
  await assertSucceeds(getDoc(doc(a, 'orders/CHV-AAAAAA')));
  await assertSucceeds(getDocs(collection(a, 'orders')));
  await assertSucceeds(updateDoc(doc(a, 'orders/CHV-AAAAAA'), { status: 'Picked Up' }));
  await assertSucceeds(updateDoc(doc(a, 'orders/CHV-AAAAAA'), { riderName: 'Test Rider', riderPhone: '01700000009' }));
  await assertSucceeds(updateDoc(doc(a, 'tracking/CHV-AAAAAA'), { status: 'Picked Up' }));
});

// ---- merchants, requests, private
test('merchant reads own merchant doc only; guest cannot list', async () => {
  await assertSucceeds(getDoc(doc(user('m1'), 'merchants/m1')));
  await assertFails(getDoc(doc(user('m1'), 'merchants/m3')));
  await assertFails(getDocs(collection(guest(), 'merchants')));
});
test('private/charges: approved yes, blocked no, guest no', async () => {
  await assertSucceeds(getDoc(doc(user('m1'), 'private/charges')));
  await assertFails(getDoc(doc(user('m2'), 'private/charges')));
  await assertFails(getDoc(doc(guest(), 'private/charges')));
});
const req = (extra = {}) => ({ businessName: 'Test', ownerFirst: 'A', ownerLast: 'B', businessType: 'Shop', branches: 1,
  email: 'a@b.c', mobile: '01712345678', businessPhone: '01712345678', samePhone: true, agreed: true,
  status: 'pending', createdAt: serverTimestamp(), ...extra });
test('merchantRequests: valid ok; bad mobile, extra field, guest read denied', async () => {
  const g = guest();
  await assertSucceeds(setDoc(doc(g, 'merchantRequests/r1'), req()));
  await assertFails(setDoc(doc(g, 'merchantRequests/r2'), req({ mobile: '123' })));
  await assertFails(setDoc(doc(g, 'merchantRequests/r3'), req({ riderId: 'x' })));
  await assertFails(getDoc(doc(g, 'merchantRequests/r1')));
});
