/* بنزين الموصل — MVP 0.1 */

const SEED = [
  { id:1, name:"محطة الزهور",   area:"حي الزهور",   lat:36.3450, lng:43.1500, status:"available", cars:12, wait:8,  updated:Date.now()-4*60000,  conf:85 },
  { id:2, name:"محطة الجامعة",  area:"جامعة الموصل", lat:36.3760, lng:43.1530, status:"busy",      cars:60, wait:35, updated:Date.now()-12*60000, conf:70 },
  { id:3, name:"محطة الدواسة",  area:"الدواسة",     lat:36.3400, lng:43.1200, status:"empty",     cars:0,  wait:0,  updated:Date.now()-40*60000, conf:60 },
  { id:4, name:"محطة النصر",    area:"حي النصر",    lat:36.3900, lng:43.1100, status:"available", cars:5,  wait:3,  updated:Date.now()-2*60000,  conf:90 },
  { id:5, name:"محطة الصناعة",  area:"حي الصناعة",  lat:36.3600, lng:43.1700, status:"available", cars:20, wait:12, updated:Date.now()-7*60000,  conf:75 },
  { id:6, name:"محطة الحدباء",  area:"الحدباء",     lat:36.3700, lng:43.1300, status:"busy",      cars:45, wait:28, updated:Date.now()-9*60000,  conf:65 },
  { id:7, name:"محطة الزهراء",  area:"حي الزهراء",  lat:36.3300, lng:43.1600, status:"empty",     cars:0,  wait:0,  updated:Date.now()-55*60000, conf:70 },
  { id:8, name:"محطة الرشيدية", area:"الرشيدية",    lat:36.4100, lng:43.1000, status:"available", cars:8,  wait:6,  updated:Date.now()-3*60000,  conf:80 }
];

const LABEL = { available:"متوفر", busy:"ازدحام", empty:"نافد", unknown:"غير معروف" };
const BADGE = { available:"green", busy:"orange", empty:"red", unknown:"gray" };
const COLOR = { available:"#18a36d", busy:"#f0a020", empty:"#e03b3b", unknown:"#8b9a96" };

let stations = loadStations();
let map, markers = {};
let currentFilter = "all";
let userPos = null, userMarker = null;
let activeStation = null, chosenStatus = null;

function loadStations(){
  const saved = JSON.parse(localStorage.getItem("benzine_reports") || "{}");
  return SEED.map(s => {
    const o = saved[s.id];
    return o ? { ...s, ...o } : { ...s };
  });
}
function persist(id, patch){
  const saved = JSON.parse(localStorage.getItem("benzine_reports") || "{}");
  saved[id] = { ...(saved[id] || {}), ...patch };
  localStorage.setItem("benzine_reports", JSON.stringify(saved));
}

function timeAgo(ts){
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return `قبل ${Math.round(h/24)} يوم`;
}

function scoreStation(s){
  if (s.status !== "available") return 9999;
  return s.wait * 2 + (100 - s.conf) / 5;
}

function initMap(){
  map = L.map("map", { zoomControl: true }).setView([36.365, 43.140], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap"
  }).addTo(map);
  renderAll();
}

function renderMarkers(){
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  stations.forEach(s => {
    const m = L.circleMarker([s.lat, s.lng], {
      radius: 11, color:"#fff", weight:3, fillColor: COLOR[s.status], fillOpacity:1
    }).addTo(map);
    m.bindPopup(popupHtml(s));
    m.on("popupopen", () => {
      const btn = document.querySelector(`#pop-${s.id} .popReport`);
      if (btn) btn.addEventListener("click", () => openDialog(s));
    });
    markers[s.id] = m;
  });
}

function popupHtml(s){
  return `<div id="pop-${s.id}" style="min-width:180px">
    <div style="font-weight:800;font-size:15px">${s.name}</div>
    <div class="muted" style="margin-bottom:6px">${s.area} • ${timeAgo(s.updated)}</div>
    <div class="metrics" style="margin:6px 0">
      <span class="metric">${LABEL[s.status]}</span>
      <span class="metric">🚗 ${s.cars}</span>
      <span class="metric">⏱ ${s.wait} د</span>
    </div>
    <button class="popReport" style="width:100%;border:0;border-radius:10px;padding:9px;background:#075b4d;color:#fff;font-weight:800;cursor:pointer">🔄 تحديث الحالة</button>
  </div>`;
}

function cardHtml(s){
  return `<div class="card" data-id="${s.id}">
    <div class="row">
      <div><div class="stationName">${s.name}</div><div class="muted">${s.area} • ${timeAgo(s.updated)}</div></div>
      <span class="badge ${BADGE[s.status]}">${LABEL[s.status]}</span>
    </div>
    <div class="metrics">
      <span class="metric">🚗 ~${s.cars} سيارة</span>
      <span class="metric">⏱ ~${s.wait} دقيقة</span>
      <span class="metric">✅ ثقة ${s.conf}%</span>
    </div>
    <div class="actions">
      <button class="report" data-report="${s.id}">🔄 تحديث الحالة</button>
      <button class="navigate" data-nav="${s.lat},${s.lng}">🧭 ملاحة</button>
    </div>
  </div>`;
}

function renderAll(){ renderMarkers(); renderList(); renderBest(); renderStats(); renderDataAge(); }

function renderStats(){
  const c = k => stations.filter(s => s.status === k).length;
  document.querySelector("#availableCount").textContent = c("available");
  document.querySelector("#busyCount").textContent = c("busy");
  document.querySelector("#emptyCount").textContent = c("empty");
  document.querySelector("#unknownCount").textContent = stations.length - c("available") - c("busy") - c("empty");
}

function renderDataAge(){
  const newest = Math.max(...stations.map(s => s.updated));
  document.querySelector("#dataAge").textContent = "آخر تحديث: " + timeAgo(newest);
}

function renderList(){
  const q = (document.querySelector("#search").value || "").trim();
  const list = stations.filter(s => {
    const mf = currentFilter === "all" || s.status === currentFilter;
    const mq = !q || s.name.includes(q) || s.area.includes(q);
    return mf && mq;
  });
  const el = document.querySelector("#stationList");
  el.innerHTML = list.length ? list.map(cardHtml).join("") : `<div class="emptyState">ما لقينا محطة مطابقة 🤷</div>`;
}

function renderBest(){
  const best = [...stations].sort((a,b) => scoreStation(a) - scoreStation(b))[0];
  const el = document.querySelector("#bestCard");
  el.innerHTML = (best && best.status === "available") ? cardHtml(best) : `<div class="emptyState">ما موجود محطة متوفرة حالياً 😔</div>`;
}

function openDialog(s){
  activeStation = s; chosenStatus = null;
  document.querySelector("#dialogStation").textContent = `${s.name} — ${s.area}`;
  document.querySelector("#carsInput").value = "";
  document.querySelectorAll(".reportGrid button").forEach(b => b.style.outline = "");
  document.querySelector("#reportDialog").showModal();
}

document.querySelector("#closeDialog").addEventListener("click", () => document.querySelector("#reportDialog").close());

document.querySelectorAll(".reportGrid button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".reportGrid button").forEach(b => b.style.outline = "");
    btn.style.outline = "3px solid #075b4d";
    chosenStatus = btn.dataset.status;
  });
});

document.querySelector("#sendReport").addEventListener("click", () => {
  if (!activeStation) return;
  if (!chosenStatus){ alert("اختر حالة المحطة أولاً"); return; }
  const carsInput = Number(document.querySelector("#carsInput").value);
  const statusMap = {
    available: { status:"available", wait: 5 },
    empty:     { status:"empty", wait: 0, cars: 0 },
    light:     { status:"busy", wait: 10 },
    medium:    { status:"busy", wait: 25 },
    heavy:     { status:"busy", wait: 50 }
  };
  const patch = { ...statusMap[chosenStatus], updated: Date.now(), conf: 60 };
  if (!Number.isNaN(carsInput) && carsInput >= 0) patch.cars = carsInput;
  Object.assign(activeStation, patch);
  persist(activeStation.id, patch);
  document.querySelector("#reportDialog").close();
  renderAll();
  const toast = document.createElement("div");
  toast.textContent = "✅ تم إرسال تحديثك، شكراً!";
  Object.assign(toast.style, {
    position:"fixed", bottom:"90px", left:"50%", transform:"translateX(-50%)",
    background:"#075b4d", color:"#fff", padding:"10px 18px", borderRadius:"20px",
    fontSize:"13px", zIndex: 3000, boxShadow:"0 6px 20px #0004"
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
});

document.addEventListener("click", e => {
  const rb = e.target.closest("[data-report]");
  if (rb){ const s = stations.find(x => x.id == rb.dataset.report); if (s) openDialog(s); return; }
  const nb = e.target.closest("[data-nav]");
  if (nb){ const [lat,lng] = nb.dataset.nav.split(",");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank"); }
});

document.querySelector("#search").addEventListener("input", renderList);

document.querySelectorAll(".filter").forEach(f => {
  f.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(x => x.classList.remove("active"));
    f.classList.add("active"); currentFilter = f.dataset.filter; renderList();
  });
});

function locate(zoomIn){
  if (!navigator.geolocation){ alert("متصفحك ما يدعم تحديد الموقع"); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userPos = [pos.coords.latitude, pos.coords.longitude];
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker(userPos, { radius:9, color:"#fff", weight:3, fillColor:"#1e7bff", fillOpacity:1 }).addTo(map).bindPopup("موقعك الحالي 📍");
      if (zoomIn) map.setView(userPos, 14);
    },
    () => alert("ما قدرنا نحدد موقعك. تأكد من إذن الموقع."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

document.querySelector("#locateBtn").addEventListener("click", () => locate(true));

document.querySelector("#nearBtn").addEventListener("click", () => {
  if (!userPos){ locate(true); return; }
  const sorted = [...stations].sort((a,b) => map.distance([a.lat,a.lng], userPos) - map.distance([b.lat,b.lng], userPos));
  const near = sorted[0];
  map.setView([near.lat, near.lng], 15);
  markers[near.id].openPopup();
});

document.querySelectorAll(".nav").forEach(n => {
  n.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach(x => x.classList.remove("active"));
    n.classList.add("active");
    const tab = n.dataset.tab;
    if (tab === "mapTab"){ window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const msgs = {
      updates: "🔄 سجل التحديثات — قريباً",
      services: "🧰 خدمات قادمة قريباً",
      account: "👤 حسابي — قريباً"
    };
    alert(msgs[tab] || "قريباً");
  });
});

initMap();

if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
   }
