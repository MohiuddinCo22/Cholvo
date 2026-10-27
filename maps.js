/* Cholvo: automatic road distance for the price calculator (Google Routes API, no autocomplete).
   Paste your Google API key below. */
(()=>{
// no key yet: calculator keeps working with manual km

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
async function roadKm() {
  const params = new URLSearchParams({
    origin: pick.value.trim() + ", Chattogram, Bangladesh",
    destination: del.value.trim() + ", Chattogram, Bangladesh"
  });

  const response = await fetch(
    `/.netlify/functions/route?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok || typeof data.distanceKm !== "number") {
    throw new Error(data.error || "Could not calculate road distance");
  }

  return data.distanceKm;
}


const f = n => '৳' + n.toFixed(2).replace(/\.00$/, '');

function getDeliveryCharge(km) {
  if (!Number.isFinite(km) || km < 0) {
    throw new Error('Invalid road distance');
  }

  if (km <= 1) return 80;
  if (km <= 2) return 100;
  if (km <= 3) return 120;
  if (km <= 5) return 140;

  return 140 + Math.ceil(km - 5) * 10;
}

function show(km) {
  const cod = +$('#cod').value || 0;
  const delivery = getDeliveryCharge(km);
  const cc = cod * 0.01;
  const total = delivery + cc;

  out.className = '';
  out.innerHTML = `
    <div class="row">
      <span>Distance by road</span>
      <span>${km.toFixed(1)} km</span>
    </div>
    <div class="row">
      <span>Delivery charge</span>
      <span>${f(delivery)}</span>
    </div>
    <div class="row">
      <span>COD charge (1% of ${f(cod)})</span>
      <span>${f(cc)}</span>
    </div>
    <div class="total">
      <span>Grand total</span>
      <b>${f(total)}</b>
    </div>`;
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
