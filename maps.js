/* Cholvo: automatic road distance for the price calculator (Google Routes API, no autocomplete).
   Paste your Google API key below. */
(()=>{
const KEY='YOUR_GOOGLE_MAPS_KEY';
if(KEY==='YOUR_GOOGLE_MAPS_KEY')return; // no key yet: calculator keeps working with manual km

const $=s=>document.querySelector(s);
const form=$('#calcForm'),del=$('#addr'),dist=$('#dist'),out=$('#out');
if(!form||!del||!dist||!out)return;

// add the pickup field before the delivery address
del.parentElement.insertAdjacentHTML('beforebegin','<div style="grid-column:1/-1"><label for="pick">Pickup address</label><input id="pick" placeholder="Pickup area or shop name, e.g. GEC Circle" required></div>');
const pick=$('#pick');
del.placeholder='Delivery area or address, e.g. Agrabad';del.required=true;
dist.readOnly=true;dist.required=false;dist.value='';dist.placeholder='Auto';
if(dist.nextElementSibling)dist.nextElementSibling.textContent='Calculated automatically from the two addresses.';

const place=i=>{let a=i.value.trim();if(!/chattogram|chittagong|ctg/i.test(a))a+=', Chattogram';return{address:a+', Bangladesh'}};
async function roadKm(){
 const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',
  headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY,'X-Goog-FieldMask':'routes.distanceMeters'},
  body:JSON.stringify({origin:place(pick),destination:place(del),travelMode:'DRIVE',regionCode:'BD'})});
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
   out.className='empty';out.textContent='Could not find the distance. Add the area name to both addresses, or type the distance in km and press Calculate.';
  }
  b.disabled=false;return;
 }
 const km=+dist.value;if(km>0)show(km);
};
})();
