// Importa Firebase (asegúrate de tener instalado Firebase con npm o enlazar el SDK en HTML)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Importa Leaflet y Leaflet Routing Machine
import L from "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js";
import "https://cdn.jsdelivr.net/npm/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js";

// --- Configuración Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyCBz2s5jDGtbNNpEQSVeqbkD85m6dTRWB0",
  authDomain: "ubix-81203.firebaseapp.com",
  projectId: "ubix-81203",
  storageBucket: "ubix-81203.appspot.com",
  messagingSenderId: "247852658625",
  appId: "1:247852658625:web:5dd6d4a09ca717267b0940",
  measurementId: "G-2Z859ZVS29"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Inicialización del mapa ---
const map = L.map("map").setView([19.4326, -99.1332], 13); // CDMX como ejemplo

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }
).addTo(map);

// --- Variables globales ---
let routePoints = [];
let routeMarkers = [];
let routingControl = null;
let tracing = false;
let lastRouteWaypoints = null;

let busMarker = null;
let simulationPaused = false;
let simulationStopped = false;

// --- FUNCIONES ---

function clearRoute() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  routeMarkers.forEach(m => map.removeLayer(m));
  routeMarkers = [];
  routePoints = [];
  lastRouteWaypoints = null;
  localStorage.removeItem("rutaCompleta");
}

function toggleTracing() {
  tracing = !tracing;
  document.getElementById("traceBtn").textContent = tracing ? "Detener trazo" : "Trazar ruta";
}

map.on("click", (e) => {
  if (!tracing) return;
  
  const latlng = e.latlng;
  routePoints.push(latlng);
  const marker = L.marker(latlng).addTo(map);
  routeMarkers.push(marker);

  if (routePoints.length >= 2) {
    if (routingControl) map.removeControl(routingControl);

    routingControl = L.Routing.control({
      waypoints: routePoints,
      routeWhileDragging: false,
      draggableWaypoints: false,
      addWaypoints: false,
      show: false
    }).addTo(map);

    lastRouteWaypoints = routePoints.map(p => ({ lat: p.lat, lng: p.lng }));
    localStorage.setItem("rutaCompleta", JSON.stringify(lastRouteWaypoints));
  }
});

async function saveRoute() {
  if (!lastRouteWaypoints || lastRouteWaypoints.length < 2) {
    alert("Traza una ruta primero.");
    return;
  }

  const nombre = prompt("Nombre de la ruta:");
  if (!nombre) {
    alert("Debe ingresar un nombre.");
    return;
  }

  try {
    await setDoc(doc(db, "rutas", nombre), { waypoints: lastRouteWaypoints });
    alert("Ruta guardada.");
    updateSavedRoutesDropdown();
  } catch (error) {
    console.error("Error al guardar ruta:", error);
    alert("Error al guardar ruta.");
  }
}

async function loadRoute() {
  const select = document.getElementById("savedRoutes");
  const name = select.value;
  if (!name) {
    alert("Selecciona una ruta.");
    return;
  }

  try {
    const docSnap = await getDoc(doc(db, "rutas", name));
    if (docSnap.exists()) {
      const waypoints = docSnap.data().waypoints;
      clearRoute();

      waypoints.forEach(p => {
        const marker = L.marker([p.lat, p.lng]).addTo(map);
        routeMarkers.push(marker);
        routePoints.push(L.latLng(p.lat, p.lng));
      });

      routingControl = L.Routing.control({
        waypoints: routePoints,
        routeWhileDragging: false,
        draggableWaypoints: false,
        addWaypoints: false,
        show: false
      }).addTo(map);

      lastRouteWaypoints = waypoints;
      localStorage.setItem("rutaCompleta", JSON.stringify(lastRouteWaypoints));
    } else {
      alert("Ruta no encontrada.");
    }
  } catch (error) {
    console.error("Error al cargar ruta:", error);
    alert("Error al cargar ruta.");
  }
}

async function deleteRoute() {
  const select = document.getElementById("savedRoutes");
  const name = select.value;
  if (!name) {
    alert("Selecciona una ruta para eliminar.");
    return;
  }

  try {
    await deleteDoc(doc(db, "rutas", name));
    clearRoute();
    updateSavedRoutesDropdown();
    alert("Ruta eliminada.");
  } catch (error) {
    console.error("Error al eliminar ruta:", error);
    alert("Error al eliminar ruta.");
  }
}

async function updateSavedRoutesDropdown() {
  const select = document.getElementById("savedRoutes");
  select.innerHTML = "";
  try {
    const querySnapshot = await getDocs(collection(db, "rutas"));
    querySnapshot.forEach(doc => {
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = doc.id;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error al obtener rutas guardadas:", error);
  }
}

function createSimulationControls() {
  if (document.getElementById("simControls")) return;

  const container = document.createElement("div");
  container.id = "simControls";
  container.style.position = "fixed";
  container.style.bottom = "40px";
  container.style.left = "10px";
  container.style.backgroundColor = "#fff";
  container.style.border = "1px solid #ccc";
  container.style.padding = "8px";
  container.style.zIndex = "2000";
  container.style.borderRadius = "5px";
  container.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  container.style.display = "flex";
  container.style.gap = "10px";

  const pauseBtn = document.createElement("button");
  pauseBtn.textContent = "Pausar";
  pauseBtn.onclick = () => { simulationPaused = true; };

  const resumeBtn = document.createElement("button");
  resumeBtn.textContent = "Reanudar";
  resumeBtn.onclick = () => { if (!simulationStopped) simulationPaused = false; };

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Detener";
  stopBtn.onclick = () => {
    simulationStopped = true;
    simulationPaused = false;
    if (busMarker) {
      map.removeLayer(busMarker);
      busMarker = null;
    }
    const progressBar = document.getElementById("simProgressBar");
    if (progressBar) progressBar.style.width = "0%";
  };

  container.appendChild(pauseBtn);
  container.appendChild(resumeBtn);
  container.appendChild(stopBtn);

  document.body.appendChild(container);
}

function waitWhilePaused() {
  return new Promise((resolve) => {
    function check() {
      if (simulationStopped) resolve("stopped");
      else if (!simulationPaused) resolve("resumed");
      else setTimeout(check, 100);
    }
    check();
  });
}

async function simulateRoute() {
  let ruta = (lastRouteWaypoints && lastRouteWaypoints.length >= 2)
    ? lastRouteWaypoints
    : JSON.parse(localStorage.getItem("rutaCompleta"));

  if (!ruta || ruta.length < 2) {
    alert("Primero crea o carga una ruta válida.");
    return;
  }

  createSimulationControls();
  simulationPaused = false;
  simulationStopped = false;

  const busIcon = L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/61/61212.png",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  if (busMarker) {
    map.removeLayer(busMarker);
    busMarker = null;
  }

  busMarker = L.marker([ruta[0].lat, ruta[0].lng], { icon: busIcon }).addTo(map);

  let progressBar = document.getElementById("simProgressBar");
  if (!progressBar) {
    progressBar = document.createElement("div");
    progressBar.id = "simProgressBar";
    progressBar.style.position = "fixed";
    progressBar.style.bottom = "0";
    progressBar.style.left = "0";
    progressBar.style.height = "6px";
    progressBar.style.width = "0%";
    progressBar.style.backgroundColor = "#ff8c00";
    progressBar.style.zIndex = "2000";
    progressBar.style.transition = "width 0.3s linear";
    document.body.appendChild(progressBar);
  }

  const totalPuntos = ruta.length;

  for (let i = 0; i < totalPuntos; i++) {
    const status = await waitWhilePaused();
    if (status === "stopped") break;

    const punto = ruta[i];
    busMarker.setLatLng([punto.lat, punto.lng]);

    const progreso = ((i + 1) / totalPuntos) * 100;
    progressBar.style.width = `${progreso}%`;

    await new Promise(r => setTimeout(r, 300));
  }

  if (!simulationStopped) {
    alert("Simulación terminada");
  } else {
    alert("Simulación detenida");
  }

  progressBar.style.width = "0%";
  simulationStopped = true;
  simulationPaused = false;
}

// --- Eventos botones ---
document.getElementById("traceBtn").addEventListener("click", toggleTracing);
document.getElementById("saveRouteBtn").addEventListener("click", saveRoute);
document.getElementById("loadRouteBtn").addEventListener("click", loadRoute);
document.getElementById("clearRouteBtn").addEventListener("click", deleteRoute);
document.getElementById("simulateBtn").addEventListener("click", simulateRoute);

// --- Inicializar ---
updateSavedRoutesDropdown();

