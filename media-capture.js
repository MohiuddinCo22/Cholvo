/* CHOLVO media capture: record a voice message (max 60 s) and/or attach up to 8 photos,
   then send them to /api/media (which forwards them to our private Telegram group).
   Usage: CholvoMedia.attach(rootEl, {formEl, endpoint, turnstileKey, keep:['phone'], useTurnstile:()=>bool}) -> controller */
window.CholvoMedia = (function () {
  var MAX_SEC = 60, MAX_PHOTOS = 8, PHOTO_PX = 1280;
  var LAME = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  var TS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    return loaded[src] = new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { delete loaded[src]; bad(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  // Voice -> small mono MP3 (plays everywhere in Telegram). Falls back to the raw recording if anything fails.
  async function toMp3(raw) {
    await loadScript(LAME);
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    var buf = await ctx.decodeAudioData(await raw.arrayBuffer());
    if (ctx.close) ctx.close();
    var rate = 16000, oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.max(1, Math.ceil(buf.duration * rate)), rate);
    var src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
    var f = (await oc.startRendering()).getChannelData(0), pcm = new Int16Array(f.length);
    for (var i = 0; i < f.length; i++) { var x = Math.max(-1, Math.min(1, f[i])); pcm[i] = x < 0 ? x * 0x8000 : x * 0x7FFF; }
    var enc = new lamejs.Mp3Encoder(1, rate, 48), parts = [], c;
    for (i = 0; i < pcm.length; i += 1152) { c = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (c.length) parts.push(c); }
    c = enc.flush(); if (c.length) parts.push(c);
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  async function shrink(file) {
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = url; });
      var k = Math.min(1, PHOTO_PX / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.8); });
    } finally { URL.revokeObjectURL(url); }
  }

  function attach(root, o) {
    var form = o.formEl, keep = o.keep || [];
    var q = function (s) { return root.querySelector(s); };
    var recBtn = q('[data-rec]'), delBtn = q('[data-del]'), player = q('[data-ap]'), status = q('[data-st]'),
        pickBtn = q('[data-pick]'), file = q('[data-photos]'), thumbs = q('[data-thumbs]'), slot = q('[data-ts]');
    var rec, stream, chunks = [], timer, sec = 0, voice = null, photos = [], busy = false, tsId = null, tsToken = '', cbs = [];

    function say(t) { status.textContent = t || ''; }
    function has() { return !!voice || photos.length > 0; }
    // With a voice message or photos attached, every other field in the form is switched off (greyed out, not clickable)
    // and is not sent. Only the fields listed in opts.keep (the phone number) stay active.
    function lock(on) {
      Array.prototype.forEach.call(form.querySelectorAll('input,textarea,select'), function (el) {
        if (root.contains(el) || keep.indexOf(el.name) >= 0 || el.classList.contains('hp') || el.type === 'hidden') return;
        if (on) { if (!el.disabled) { el.dataset.mlock = '1'; el.disabled = true; } }
        else if (el.dataset.mlock) { el.disabled = false; delete el.dataset.mlock; }
      });
      form.classList.toggle('media-on', on);
    }
    function changed() {
      lock(has());
      delBtn.hidden = !voice; player.hidden = !voice;
      pickBtn.textContent = '📷 Add photos (' + photos.length + '/' + MAX_PHOTOS + ')';
      pickBtn.disabled = photos.length >= MAX_PHOTOS;
      thumbs.innerHTML = '';
      photos.forEach(function (p, i) {
        var d = document.createElement('div'); d.className = 'mthumb';
        var im = document.createElement('img'); im.src = p.url; im.alt = 'Photo ' + (i + 1);
        var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove photo');
        x.onclick = function () { URL.revokeObjectURL(p.url); photos.splice(i, 1); changed(); };
        d.appendChild(im); d.appendChild(x); thumbs.appendChild(d);
      });
      if (has()) ensureWidget();
      cbs.forEach(function (f) { f(); });
    }

    async function ensureWidget() {
      if (tsId !== null || !o.useTurnstile || !o.useTurnstile() || !o.turnstileKey) return;
      tsId = -1;
      try {
        await loadScript(TS);
        tsId = turnstile.render(slot, { sitekey: o.turnstileKey, callback: function (t) { tsToken = t; }, 'expired-callback': function () { tsToken = ''; }, 'error-callback': function () { tsToken = ''; } });
      } catch (_) { tsId = null; say('Could not load the robot check. Check your connection.'); }
    }

    async function start() {
      if (busy) return;
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('This browser cannot record voice. Please type your details or add photos.'); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (_) { say('Microphone permission was blocked. Allow it in the browser settings, or add photos instead.'); return; }
      var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async function () {
        stream.getTracks().forEach(function (t) { t.stop(); }); clearInterval(timer);
        recBtn.textContent = '🎤 Record voice'; recBtn.classList.remove('rec');
        var raw = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        if (raw.size < 1500) { say('That was too short. Please try again.'); return; }
        busy = true; recBtn.disabled = true; say('Preparing…');
        try { voice = await toMp3(raw); } catch (_) { voice = raw; }
        busy = false; recBtn.disabled = false;
        if (voice.size > 3.8 * 1024 * 1024) { voice = null; say('The recording is too large. Please keep it under 60 seconds.'); changed(); return; }
        player.src = URL.createObjectURL(voice); say('Voice message ready (' + fmt(Math.max(1, sec)) + ').'); changed();
      };
      rec.start(); sec = 0; recBtn.textContent = '⏹ Stop (0:00)'; recBtn.classList.add('rec'); say('Recording… speak now (max 1 minute).');
      timer = setInterval(function () { sec++; recBtn.textContent = '⏹ Stop (' + fmt(sec) + ')'; if (sec >= MAX_SEC) rec.stop(); }, 1000);
    }

    recBtn.onclick = function () { if (rec && rec.state === 'recording') rec.stop(); else start(); };
    delBtn.onclick = function () { if (player.src) URL.revokeObjectURL(player.src); player.removeAttribute('src'); voice = null; say(''); changed(); };
    pickBtn.onclick = function () { file.click(); };
    file.onchange = async function () {
      var list = Array.prototype.slice.call(file.files || []).slice(0, MAX_PHOTOS - photos.length); file.value = '';
      for (var i = 0; i < list.length; i++) {
        try { var b = await shrink(list[i]); if (b && b.size <= 3.8 * 1024 * 1024) photos.push({ blob: b, url: URL.createObjectURL(b) }); } catch (_) { say('One photo could not be read.'); }
      }
      changed();
    };

    return {
      has: has,
      counts: function () { return { voice: !!voice, photos: photos.length }; },
      onChange: function (f) { cbs.push(f); },
      reset: function () {
        if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); stream && stream.getTracks().forEach(function (t) { t.stop(); }); clearInterval(timer); recBtn.textContent = '🎤 Record voice'; recBtn.classList.remove('rec'); }
        if (player.src) URL.revokeObjectURL(player.src); player.removeAttribute('src');
        photos.forEach(function (p) { URL.revokeObjectURL(p.url); }); photos = []; voice = null; say(''); changed();
      },
      // meta: {tn, type, phone, text, idToken}
      upload: async function (meta) {
        var needTs = !meta.idToken && o.useTurnstile && o.useTurnstile();
        if (needTs && !tsToken) { var e0 = new Error('Please complete the robot check first.'); e0.media = true; throw e0; }
        var fd = new FormData();
        fd.append('tn', meta.tn); fd.append('type', meta.type); fd.append('phone', meta.phone || ''); fd.append('text', meta.text || '');
        if (meta.idToken) fd.append('idToken', meta.idToken);
        if (needTs) fd.append('cf-turnstile-response', tsToken);
        if (voice) { var ext = /mpeg/.test(voice.type) ? 'mp3' : /mp4/.test(voice.type) ? 'm4a' : /ogg/.test(voice.type) ? 'ogg' : 'webm'; fd.append('voice', voice, 'voice.' + ext); }
        photos.forEach(function (p, i) { fd.append('photo', p.blob, 'photo' + (i + 1) + '.jpg'); });
        var res, j = {};
        try { res = await fetch(o.endpoint, { method: 'POST', body: fd }); j = await res.json().catch(function () { return {}; }); }
        catch (_) { var e1 = new Error('Could not send the voice/photos. Check your connection and try again.'); e1.media = true; throw e1; }
        finally { if (needTs && tsId !== null && tsId !== -1 && window.turnstile) { tsToken = ''; try { turnstile.reset(tsId); } catch (_) {} } }
        if (!res.ok) { var e2 = new Error(j.error || 'Could not send. Please try again.'); e2.media = true; throw e2; }
      },
    };
  }
  return { attach: attach };
})();
