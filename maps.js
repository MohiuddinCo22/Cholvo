/* Cholvo: Google Maps address suggestions + automatic distance for the price calculator.
   Uses Places API (New) and Routes API. Paste your key below. */
(()=>{
const KEY='YOUR_GOOGLE_MAPS_KEY';
if(KEY==='YOUR_GOOGLE_MAPS_KEY')return; // no key yet: calculator keeps working with manual km

const $=s=>document.querySelector(s);
const form=$('#calcForm'),del=$('#addr'),dist=$('#dist'),out=$('#out');
if(!form||!del||!dist||!out)return;

// styles for the suggestion list
const st=document.createElement('style');
st.textContent='.gm-list{position:absolute;left:0;right:0;top:100%;z-index:30;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 28px rgba(7,26,58,.18);margin-top:4px;overflow:hidden}.gm-list[hidden]{display:none}.gm-list button{display:block;width:100%;text-align:left;border:0;background:#fff;padding:11px 14px;cursor:pointer;font-size:.9rem;color:var(--ink);border-bottom:1px solid var(--mist)}.gm-list button:hover,.gm-list button:focus{background:var(--mist)}';
document.head.appendChild(st);

// add the pickup field before the delivery address
del.parentElement.insertAdjacentHTML('beforebegin','<div style="grid-column:1/-1"><label for="pick">Pickup address</label><input id="pick" placeholder="Pickup area or shop name" autocomplete="off" required></div>');
const pick=$('#pick');
del.placeholder='Delivery area or address';del.required=true;del.autocomplete='off';
dist.readOnly=true;dist.required=false;dist.value='';dist.placeholder='Auto';
if(dist.nextElementSibling)dist.nextElementSibling.textContent='Calculated automatically from the two addresses.';

const H={'Content-Type':'application/json','X-Goog-Api-Key':KEY};

function attach(inp){
 const box=document.createElement('div');box.className='gm-list';box.hidden=true;
 inp.parentElement.style.position='relative';inp.parentElement.appendChild(box);
 let t,tok=crypto.randomUUID();
 inp.addEventListener('input',()=>{
  delete inp.dataset.pid;clearTimeout(t);
  const v=inp.value.trim();if(v.length<3){box.hidden=true;return}
  t=setTimeout(async()=>{
   try{
    const r=await fetch('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers:H,body:JSON.stringify({
     input:v,sessionToken:tok,includedRegionCodes:['bd'],
     locationBias:{circle:{center:{latitude:22.3569,longitude:91.7832},radius:50000}}})});
    const j=await r.json();
    const s=(j.suggestions||[]).filter(x=>x.placePrediction).slice(0,5);
    box.innerHTML='';
    s.forEach(x=>{const p=x.placePrediction,b=document.createElement('button');
     b.type='button';b.textContent=p.text.text;
     b.onclick=()=>{inp.value=p.text.text;inp.dataset.pid=p.placeId;box.hidden=true;tok=crypto.randomUUID()};
     box.appendChild(b)});
    box.hidden=!s.length;
   }catch(_){box.hidden=true}
  },300)});
 inp.addEventListener('blur',()=>setTimeout(()=>{box.hidden=true},200));
}
attach(pick);attach(del);

const loc=i=>i.dataset.pid?{placeId:i.dataset.pid}:{address:i.value.trim()+', Bangladesh'};
async function roadKm(){
 const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',
  headers:{...H,'X-Goog-FieldMask':'routes.distanceMeters'},
  body:JSON.stringify({origin:loc(pick),destination:loc(del),travelMode:'DRIVE',regionCode:'BD'})});
 const j=await r.json(),m=j.routes&&j.routes[0]&&j.routes[0].distanceMeters;
 if(!r.ok||!m)throw new Error('no route');
 return m/1000;
}

const f=n=>'৳'+n.toFixed(2).replace(/\.00$/,'');
function show(km){
 const cod=+$('#cod').value||0,p=price(km),cc=cod*0.01,tot=p.base+p.extra+cc;
 out.className='';
 out.innerHTML=`<div class="row"><span>Distance by road</span><span>${km.toFixed(1)} km</span></div>
 <div class="row"><span>Base delivery (first 5 km)</span><span>${f(p.base)}</span></div>
 <div class="row"><span>Extra distance (${Math.ceil(km)} km)</span><span>${f(p.extra)}</span></div>
 <div class="row"><span>COD charge (1% of ${f(cod)})</span><span>${f(cc)}</span></div>
 <div class="total"><span>Grand total</span><b>${f(tot)}</b></div>`;
}

form.onsubmit=async e=>{
 e.preventDefault();
 const b=form.querySelector('button[type=submit]');
 if(dist.readOnly){
  b.disabled=true;out.className='empty';out.textContent='Checking distance…';
  try{const km=await roadKm();dist.value=km.toFixed(1);show(km)}
  catch(_){
   dist.readOnly=false;dist.required=true;
   out.className='empty';out.textContent='Could not find the distance. Check both addresses, or type the distance in km and press Calculate.';
  }
  b.disabled=false;return;
 }
 const km=+dist.value;if(km>0)show(km);
};
})();
