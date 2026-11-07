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

// ---- Phase 2: riders
const snap = (extra = {}) => ({ riderId: 'r1', riderName: 'Test Rider', riderPhone: '01700000009',
  riderAssignedAt: serverTimestamp(), riderAssignedBy: 'admin@cholvo.com', ...extra });
test('riders collection: admin only', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'riders/r1'), { name: 'Test Rider', phone: '01700000009', active: true }));
  await assertSucceeds(getDocs(collection(admin(), 'riders')));
  await assertFails(getDocs(collection(user('m1'), 'riders')));
  await assertFails(getDoc(doc(user('m1'), 'riders/r1')));
  await assertFails(getDoc(doc(guest(), 'riders/r1')));
  await assertFails(setDoc(doc(user('m1'), 'riders/r9'), { name: 'x', phone: '01700000009', active: true }));
  await assertFails(setDoc(doc(guest(), 'riders/r9'), { name: 'x', phone: '01700000009', active: true }));
});
test('admin can assign a full rider snapshot', () =>
  assertSucceeds(updateDoc(doc(admin(), 'orders/CHV-AAAAAA'), snap())));
test('admin cannot write a partial rider snapshot', () =>
  assertFails(updateDoc(doc(admin(), 'orders/CHV-AAAAAA'), { riderName: 'Only name' })));
test('admin cannot forge riderAssignedBy or bad phone', async () => {
  await assertFails(updateDoc(doc(admin(), 'orders/CHV-AAAAAA'), snap({ riderAssignedBy: 'someone@else.com' })));
  await assertFails(updateDoc(doc(admin(), 'orders/CHV-AAAAAA'), snap({ riderPhone: '123' })));
});
test('merchant cannot assign or edit rider fields', async () => {
  await assertFails(updateDoc(doc(user('m1'), 'orders/CHV-AAAAAA'), snap()));
  await assertFails(updateDoc(doc(user('m1'), 'orders/CHV-AAAAAA'), { riderName: 'x' }));
});
test('merchant reads rider snapshot on own order only', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await updateDoc(doc(c.firestore(), 'orders/CHV-AAAAAA'), { riderId: 'r1', riderName: 'Test Rider', riderPhone: '01700000009' });
  });
  const d = await assertSucceeds(getDoc(doc(user('m1'), 'orders/CHV-AAAAAA')));
  if (d.data().riderName !== 'Test Rider') throw new Error('merchant should see own rider snapshot');
  await assertFails(getDoc(doc(user('m3'), 'orders/CHV-AAAAAA')));
});
test('public tracking never accepts rider fields', async () => {
  await assertFails(updateDoc(doc(guest(), 'tracking/CHV-AAAAAA'), { riderName: 'x' }));
  await assertFails(book(guest(), 'CHV-RRRRRR', { riderId: 'r1' }));
});

// ---- voice / photo orders (files go to Telegram; only two flags are stored)
const mediaOrder = (tn, extra = {}) => ({ tn, type: 'book', status: 'Order Received', merchantUid: null,
  createdAt: serverTimestamp(), phone: '01711111111', hasVoice: true, photoCount: 2, ...extra });
const mediaBatch = (db, tn, extra = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, 'orders/' + tn), mediaOrder(tn, extra));
  b.set(doc(db, 'tracking/' + tn), trackDoc());
  return b.commit();
};
test('guest voice+photo order with only a phone number works', () => assertSucceeds(mediaBatch(guest(), 'CHV-VZCEK2')));
test('photoCount above 3 or negative is rejected', async () => {
  await assertFails(mediaBatch(guest(), 'CHV-VZCEK3', { photoCount: 4 }));
  await assertFails(mediaBatch(guest(), 'CHV-VZCEK4', { photoCount: -1 }));
});
test('hasVoice / photoCount must have the right types', async () => {
  await assertFails(mediaBatch(guest(), 'CHV-VZCEK5', { hasVoice: 'yes' }));
  await assertFails(mediaBatch(guest(), 'CHV-VZCEK6', { photoCount: '2' }));
});
test('approved merchant voice order works, blocked merchant does not', async () => {
  await assertSucceeds(mediaBatch(user('m1'), 'CHV-VZCEK7', { merchantUid: 'm1' }));
  await assertFails(mediaBatch(user('m2'), 'CHV-VZCEK8', { merchantUid: 'm2' }));
});
test('public tracking still never carries media or rider info', async () => {
  await assertFails(updateDoc(doc(guest(), 'tracking/CHV-AAAAAA'), { hasVoice: true }));
});

// ---- Merchant App banners and notifications
const bn = (o = {}) => ({ file: 'banner-abcd1234.jpg', title: 'Eid offer', order: 1, active: true, createdAt: serverTimestamp(), ...o });
test('admin can create, update and delete a banner', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'banners/abcd1234'), bn()));
  await assertSucceeds(updateDoc(doc(admin(), 'banners/abcd1234'), { active: false, order: 3 }));
  await assertSucceeds(deleteDoc(doc(admin(), 'banners/abcd1234')));
});
test('banner shape is validated', async () => {
  await assertFails(setDoc(doc(admin(), 'banners/bad1'), bn({ file: '../evil.jpg' })));
  await assertFails(setDoc(doc(admin(), 'banners/bad2'), bn({ file: 'banner-abcd1234.png' })));
  await assertFails(setDoc(doc(admin(), 'banners/bad3'), bn({ order: 1000 })));
  await assertFails(setDoc(doc(admin(), 'banners/bad4'), bn({ active: 'yes' })));
  await assertFails(setDoc(doc(admin(), 'banners/bad5'), bn({ extra: 1 })));
});
test('banners: approved merchant reads, others cannot read or write', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'banners/abcd1234'), bn()));
  await assertSucceeds(getDoc(doc(user('m1'), 'banners/abcd1234')));
  await assertFails(getDoc(doc(user('m2'), 'banners/abcd1234')));   // blocked merchant
  await assertFails(getDoc(doc(guest(), 'banners/abcd1234')));
  await assertFails(setDoc(doc(user('m1'), 'banners/zzzz9999'), bn({ file: 'banner-zzzz9999.jpg' })));
  await assertFails(deleteDoc(doc(user('m1'), 'banners/abcd1234')));
});
const nt = (o = {}) => ({ title: 'Holiday notice', body: 'We are closed on Friday.', createdAt: serverTimestamp(), ...o });
test('admin sends and deletes notifications', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'notifications/n1'), nt()));
  await assertSucceeds(deleteDoc(doc(admin(), 'notifications/n1')));
});
test('notification shape is validated', async () => {
  await assertFails(setDoc(doc(admin(), 'notifications/n2'), nt({ title: '' })));
  await assertFails(setDoc(doc(admin(), 'notifications/n3'), nt({ body: 'x'.repeat(501) })));
  await assertFails(setDoc(doc(admin(), 'notifications/n4'), nt({ extra: 1 })));
  await assertFails(setDoc(doc(admin(), 'notifications/n5'), nt({ createdAt: Timestamp.fromMillis(1000) })));
});
test('notifications: approved merchant reads only; guests and blocked merchants cannot', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'notifications/n1'), nt()));
  await assertSucceeds(getDoc(doc(user('m1'), 'notifications/n1')));
  await assertFails(getDoc(doc(user('m2'), 'notifications/n1')));
  await assertFails(getDoc(doc(guest(), 'notifications/n1')));
  await assertFails(setDoc(doc(user('m1'), 'notifications/n9'), nt()));
  await assertFails(deleteDoc(doc(user('m1'), 'notifications/n1')));
});
