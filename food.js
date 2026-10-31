/* Cholvo food ordering: customer login, restaurants + menu, merchant Orders/Menu. Uses globals from index.html (db, auth, TS, merchant, mdata, toast, newTN, em, esc below). */
(() => {
  if (typeof LIVE === 'undefined' || !LIVE) return;
  const q = s => document.querySelector(s), E = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tk = n => '৳' + (+n || 0);
  const fee = km => km <= 1 ? 80 : km <= 2 ? 100 : km <= 3 ? 120 : km <= 5 ? 140 : 140 + Math.ceil(km - 5) * 10;
  let cust = null, cart = {}, rest = null, menu = [], unsub = null;

  // ---- UI shell ----
  const sec = document.createElement('section');
  sec.id = 'food'; sec.style.cssText = 'padding:28px 16px;background:var(--mist)';
  sec.innerHTML = '<div class="wrap" id="foodBody"></div>';
  q('#pricing').before(sec);
  const mod = document.createElement('div');
  mod.className = 'modal'; mod.id = 'm-food';
  mod.innerHTML = '<div class="sheet"><button class="x" id="fx">&times;</button><div id="fm"></div></div>';
  document.body.append(mod);
  q('#fx').onclick = () => mod.classList.remove('open');
  const show = h => { q('#fm').innerHTML = h; mod.classList.add('open'); };
  const stop = () => { if (unsub) { unsub(); unsub = null; } };

  // ---- guest / customer / merchant home ----
  function banner() {
    return `<div class="card" style="background:var(--navy);color:#fff;margin-bottom:16px"><h2 style="color:#fff">Order anything on Cholvo</h2><p>Anything you need, we pick it up and deliver it.</p><button class="btn b-or" id="fAny" style="margin-top:10px">Order anything</button></div>`;
  }
  async function draw() {
    stop();
    const b = q('#foodBody');
    if (merchant) return merchantHome(b);
    if (!cust) {
      b.innerHTML = banner() + '<div class="card"><h3>Order food from restaurants</h3><p class="sub">Create a customer account or login to see restaurants and order.</p><button class="btn b-or" id="fLog" style="margin-top:10px">Customer login / sign up</button></div>';
      q('#fLog').onclick = loginForm;
    } else {
      b.innerHTML = banner() + `<div style="display:flex;justify-content:space-between;align-items:center"><h3>Restaurants</h3><span><button class="btn b-ol" id="fMy">My orders</button> <button class="btn b-nv" id="fOut">Logout</button></span></div><div id="rl" class="grid" style="margin-top:10px"><p class="sub">Loading…</p></div>`;
      q('#fMy').onclick = myOrders; q('#fOut').onclick = () => { auth.signOut(); toast('Logged out.'); };
      try {
        const s = await db.collection('restaurants').where('active', '==', true).get();
        q('#rl').innerHTML = s.empty ? '<p class="sub">No restaurants yet.</p>' : s.docs.map(d => `<div class="card"><b>${E(d.data().name)}</b><p class="sub">${E(d.data().address || '')}</p><button class="btn b-or" data-r="${d.id}">View menu</button></div>`).join('');
        s.docs.forEach(d => q(`[data-r="${d.id}"]`).onclick = () => openRest(d.id, d.data()));
      } catch (e) { q('#rl').innerHTML = '<p class="sub">Could not load restaurants.</p>'; }
    }
    const a = q('#fAny'); if (a) a.onclick = () => q('[data-open="order"]').click();
  }

  // ---- customer: login / signup ----
  function loginForm() {
    show(`<h3>Customer account</h3><div class="tabs"><button class="on" id="t1">Login</button><button id="t2">Sign up</button></div>
    <form id="cf" class="grid"><div id="nm" hidden><label>Name</label><input name="name"></div><div><label>Phone number</label><input name="phone" pattern="01[0-9]{9}" inputmode="numeric" required></div>
    <div id="ad" hidden><label>Address</label><input name="address"></div><div><label>Password</label><input name="pw" type="password" minlength="6" required></div><button class="btn b-or">Continue</button></form>`);
    let su = false;
    const tab = on => { su = on; q('#t1').classList.toggle('on', !on); q('#t2').classList.toggle('on', on); q('#nm').hidden = q('#ad').hidden = !on; q('#nm input').required = q('#ad input').required = on; };
    q('#t1').onclick = () => tab(false); q('#t2').onclick = () => tab(true);
    q('#cf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try {
        if (su) {
          const c = await auth.createUserWithEmailAndPassword(em(f.phone.value), f.pw.value);
          await db.doc('customers/' + c.user.uid).set({ name: f.name.value.trim(), phone: f.phone.value, address: f.address.value.trim(), createdAt: TS });
        } else {
          const c = await auth.signInWithEmailAndPassword(em(f.phone.value), f.pw.value);
          if (!(await db.doc('customers/' + c.user.uid).get()).exists) { await auth.signOut(); throw { code: 'notcustomer' }; }
        }
        mod.classList.remove('open');
      } catch (er) { toast(er.code === 'auth/email-already-in-use' ? 'This number already has an account.' : er.code === 'notcustomer' ? 'Merchants login from Merchant login.' : 'Could not continue. Check number and password.'); }
    };
  }

  // ---- customer: restaurant, cart, checkout ----
  async function openRest(id, r) {
    rest = { id, ...r }; cart = {};
    const s = await db.collection('restaurants/' + id + '/menu').where('available', '==', true).get();
    menu = s.docs.map(d => ({ id: d.id, ...d.data() })); cartView();
  }
  function cartView() {
    const sub = menu.reduce((t, m) => t + (cart[m.id] || 0) * m.price, 0);
    show(`<h3>${E(rest.name)}</h3>` + menu.map(m => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><span>${E(m.name)}<br><small>${tk(m.price)}</small></span><span><button class="btn b-ol" data-m="${m.id}" data-d="-1">−</button> ${cart[m.id] || 0} <button class="btn b-or" data-m="${m.id}" data-d="1">+</button></span></div>`).join('') +
      `<p style="margin:12px 0"><b>Food total: ${tk(sub)}</b></p><button class="btn b-or" id="co" style="width:100%" ${sub ? '' : 'disabled'}>Checkout</button>`);
    document.querySelectorAll('#fm [data-m]').forEach(b => b.onclick = () => { const k = b.dataset.m; cart[k] = Math.max(0, (cart[k] || 0) + +b.dataset.d); cartView(); });
    q('#co').onclick = checkout;
  }
  async function checkout() {
    const items = menu.filter(m => cart[m.id]).map(m => ({ name: m.name, price: m.price, qty: cart[m.id] }));
    const sub = items.reduce((t, i) => t + i.price * i.qty, 0);
    let km = 0, df = 100;
    try { const r = await (await fetch('/api/route?' + new URLSearchParams({ origin: rest.address + ', Chattogram, Bangladesh', destination: cust.address + ', Chattogram, Bangladesh' }))).json(); km = r.distanceKm; df = fee(km); } catch (_) {}
    show(`<h3>Confirm order</h3><p>${items.map(i => `${E(i.name)} × ${i.qty}`).join('<br>')}</p><p>Food ${tk(sub)}<br>Delivery ${tk(df)}<br><b>Total (COD) ${tk(sub + df)}</b></p><label>Delivery address</label><input id="ca" value="${E(cust.address)}"><button class="btn b-or" id="pl" style="width:100%;margin-top:12px">Place order</button>`);
    q('#pl').onclick = async () => {
      q('#pl').disabled = true;
      try {
        const ref = db.collection('foodOrders').doc();
        await ref.set({ customerUid: auth.currentUser.uid, customerName: cust.name, customerPhone: cust.phone, address: q('#ca').value.trim(), restaurantId: rest.id, restaurantName: rest.name, pickup: rest.address || '', merchantUid: rest.id, items, foodTotal: sub, deliveryFee: df, status: 'placed', createdAt: TS });
        show('<h3>Order sent!</h3><p>The restaurant will confirm it shortly. See My orders for status.</p>');
      } catch (e) { toast('Could not place the order.'); q('#pl').disabled = false; }
    };
  }
  async function myOrders() {
    const s = await db.collection('foodOrders').where('customerUid', '==', auth.currentUser.uid).orderBy('createdAt', 'desc').limit(20).get();
    show('<h3>My orders</h3>' + (s.empty ? '<p>No orders yet.</p>' : s.docs.map(d => { const o = d.data(); return `<div class="card" style="margin-bottom:8px"><b>${E(o.restaurantName)}</b> · ${tk(o.foodTotal + o.deliveryFee)}<br><span class="stat">${E(o.status)}</span>${o.tn ? `<br>Tracking: <b>${E(o.tn)}</b>` : ''}</div>`; }).join('')));
  }

  // ---- merchant: Orders + Menu ----
  function merchantHome(b) {
    b.innerHTML = `<h3>Restaurant orders</h3><div class="tabs"><button class="on" id="mo">Orders</button><button id="mm">My menu</button></div><div id="mb"></div>`;
    const uid = auth.currentUser.uid;
    const orders = () => {
      q('#mo').classList.add('on'); q('#mm').classList.remove('on'); stop();
      unsub = db.collection('foodOrders').where('merchantUid', '==', uid).orderBy('createdAt', 'desc').limit(30).onSnapshot(s => {
        if (s.docChanges().some(c => c.type === 'added' && !s.metadata.fromCache && c.doc.data().status === 'placed')) toast('New order received!');
        q('#mb').innerHTML = s.empty ? '<p class="sub">No orders yet.</p>' : s.docs.map(d => { const o = d.data(); return `<div class="card" style="margin-bottom:8px"><b>${E(o.customerName)}</b> ${E(o.customerPhone)}<br>${o.items.map(i => `${E(i.name)} × ${i.qty}`).join(', ')}<br>Food ${tk(o.foodTotal)} · ${E(o.status)}<br>${o.status === 'placed' ? `<button class="btn b-or" data-a="${d.id}">Accept</button> <button class="btn b-ol" data-x="${d.id}">Reject</button>` : o.status === 'accepted' ? `<button class="btn b-nv" data-rd="${d.id}">Mark ready</button>` : ''}</div>`; }).join('');
        s.docs.forEach(d => {
          const set = (a, f) => { const el = q(`[${a}="${d.id}"]`); if (el) el.onclick = f; };
          set('data-a', async () => { const tn = newTN(), o = d.data(), bt = db.batch();
            bt.set(db.doc('orders/' + tn), { type: 'food', tn, status: 'Order Received', merchantUid: uid, customerName: o.customerName, customerPhone: o.customerPhone, pickup: o.pickup, address: o.address, items: o.items.map(i => i.name + ' x' + i.qty).join(', '), cod: o.foodTotal + o.deliveryFee, restaurant: o.restaurantName, createdAt: TS });
            bt.set(db.doc('tracking/' + tn), { status: 'Order Received', updatedAt: TS });
            bt.update(d.ref, { status: 'accepted', tn }); await bt.commit(); });
          set('data-x', () => d.ref.update({ status: 'rejected' }));
          set('data-rd', () => d.ref.update({ status: 'ready' }));
        });
      }, () => { q('#mb').innerHTML = '<p class="sub">Could not load orders.</p>'; });
    };
    const menuTab = async () => {
      q('#mm').classList.add('on'); q('#mo').classList.remove('on'); stop();
      const col = db.collection('restaurants/' + uid + '/menu'), s = await col.get();
      q('#mb').innerHTML = '<form id="mf" class="grid"><input name="n" placeholder="Item name" required><input name="p" type="number" min="1" placeholder="Price (৳)" required><button class="btn b-or">Add item</button></form>' +
        s.docs.map(d => `<div style="display:flex;justify-content:space-between;padding:8px 0">${E(d.data().name)} ${tk(d.data().price)} <button class="btn b-ol" data-t="${d.id}">${d.data().available ? 'In stock' : 'Out'}</button> <button class="btn b-nv" data-del="${d.id}">Delete</button></div>`).join('');
      q('#mf').onsubmit = async e => { e.preventDefault(); await col.add({ name: e.target.n.value.trim(), price: +e.target.p.value, available: true }); menuTab(); };
      s.docs.forEach(d => { q(`[data-t="${d.id}"]`).onclick = async () => { await d.ref.update({ available: !d.data().available }); menuTab(); }; q(`[data-del="${d.id}"]`).onclick = async () => { await d.ref.delete(); menuTab(); }; });
    };
    q('#mo').onclick = orders; q('#mm').onclick = menuTab;
    db.doc('restaurants/' + uid).get().then(r => { if (!r.exists) q('#mb').innerHTML = '<p class="sub">Your restaurant is not listed on Cholvo yet. Contact Cholvo to be listed.</p>'; else orders(); });
  }

  // ---- auth state ----
  let tries = 0;
  auth.onAuthStateChanged(async u => {
    cust = null;
    if (u) { try { const c = await db.doc('customers/' + u.uid).get(); if (c.exists) cust = c.data(); } catch (_) {} }
    setTimeout(draw, 700); // wait for checkMerchant to set `merchant`
  });
})();
