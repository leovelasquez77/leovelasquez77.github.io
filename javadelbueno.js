import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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

let simulationPaused = false;
let simulationStopped = false;
let map; // Declara map en un ámbito más amplio
let busMarker = null; // Declara busMarker en un ámbito más amplio

function createSimulationControls() {
  let controls = document.getElementById("simulationControls");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "simulationControls";
    controls.style.position = "fixed";
    controls.style.bottom = "10px";
    controls.style.right = "10px";
    controls.style.zIndex = "2001";
    controls.style.display = "flex";
    controls.style.gap = "6px";

    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "⏸️";
    pauseBtn.onclick = () => simulationPaused = true;

    const resumeBtn = document.createElement("button");
    resumeBtn.textContent = "▶️";
    resumeBtn.onclick = () => simulationPaused = false;

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "⏹️";
    stopBtn.onclick = () => simulationStopped = true;

    [pauseBtn, resumeBtn, stopBtn].forEach(btn => {
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "18px";
      btn.style.cursor = "pointer";
    });

    controls.appendChild(pauseBtn);
    controls.appendChild(resumeBtn);
    controls.appendChild(stopBtn);
    document.body.appendChild(controls);
  }
}

function waitWhilePaused() {
  return new Promise(resolve => {
    const check = () => {
      if (simulationStopped) return resolve("stopped");
      if (!simulationPaused) return resolve();
      requestAnimationFrame(check);
    };
    check();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const simulateBtn = document.getElementById("simulateDriverBtn");
  if (!simulateBtn) return;

  map = L.map('map').setView([12.4379, -86.8780], 13); // Asigna a la variable map de ámbito más amplio
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  let routePoints = [];
  let routeMarkers = [];
  let routingControl = null;
  let lastRouteWaypoints = [];
  let tracing = false;
  let currentPositionMarker = null;
  let currentPositionCircle = null;

  const routeBtn = document.getElementById('routeBtn');
  const clearRouteBtn = document.getElementById('clearRouteBtn');
  const saveRouteBtn = document.getElementById('saveRouteBtn');
  const loadRouteBtn = document.getElementById('loadRouteBtn');
  const savedRoutes = document.getElementById('savedRoutes');
  const searchBox = document.getElementById('searchBox');
  const menuToggle = document.getElementById('menuToggle');
  const sidePanel = document.getElementById('sidePanel');


  // Cargar ruta seleccionada
  loadRouteBtn.addEventListener('click', async () => {
    const name = savedRoutes.value;
    if (!name) return alert("Selecciona una ruta.");
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
      } else {
        alert("Ruta no encontrada.");
      }
    } catch (e) {
      console.error("Error al cargar ruta:", e);
      alert("Error al cargar la ruta.");
    }
  });

  // Guardar ruta
  saveRouteBtn.addEventListener('click', async () => {
    if (lastRouteWaypoints.length < 2) return alert("Ruta no válida.");
    const name = prompt("Nombre de la ruta:");
    if (name) await saveRouteToFirebase(name, lastRouteWaypoints);
  });

  // Borrar ruta
  clearRouteBtn.addEventListener('click', async () => {
    clearRoute();
    const name = savedRoutes.value;
    if (!name) return;
    try {
      await deleteDoc(doc(db, "rutas", name));
      updateSavedRoutesDropdown();
    } catch (e) {
      console.warn("No se pudo borrar ruta:", e);
    }
  });

  // Buscar ubicación
  searchBox.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const query = this.value.trim();
      if (!query) return;
      const viewbox = '-86.95,12.48,-86.80,12.40';
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=1`;
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.length > 0) {
            const {
              lat,
              lon
            } = data[0];
            map.setView([lat, lon], 15);
            L.marker([lat, lon]).addTo(map);
          } else {
            alert('Ubicación no encontrada en León.');
          }
        })
        .catch(() => alert('Error al buscar ubicación.'));
    }
  });

  // Trazar/finalizar ruta
  routeBtn.addEventListener('click', () => {
    tracing = !tracing;
    routeBtn.textContent = tracing ? "Finalizar Ruta" : "Trazar Ruta";
    if (!tracing) clearRoute();
  });

  // Hacer clic en mapa para añadir puntos
  map.on('click', e => {
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
      lastRouteWaypoints = routePoints.map(p => ({
        lat: p.lat,
        lng: p.lng
      }));
    }
  });

  // Abrir/cerrar panel
  menuToggle.addEventListener('click', () => {
    sidePanel.classList.toggle('open');
  });

  // Geolocalización
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(updatePosition, handleLocationError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 5000
    });
  }

  function updatePosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    if (currentPositionMarker) {
      currentPositionMarker.setLatLng([lat, lng]);
      currentPositionCircle.setLatLng([lat, lng]);
    } else {
      currentPositionMarker = L.marker([lat, lng], {
        icon: L.icon({
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
          iconSize: [25, 25]
        })
      }).addTo(map).bindPopup('¡Estás aquí!');

      currentPositionCircle = L.circle([lat, lng], {
        radius: position.coords.accuracy,
        color: '#136AEC',
        fillColor: '#136AEC',
        fillOpacity: 0.15
      }).addTo(map);
    }

    map.setView([lat, lng], 15);
  }

  function handleLocationError(error) {
    console.error('Error al obtener ubicación:', error);
    alert('No se pudo obtener tu ubicación.');
  }

  function clearRoute() {
    routeMarkers.forEach(m => map.removeLayer(m));
    routeMarkers = [];
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    routePoints = [];
    lastRouteWaypoints = [];
    tracing = false;
    routeBtn.textContent = "Trazar Ruta";
  }


  // Guardar ruta en Firestore
  async function saveRouteToFirebase(name, waypoints) {
    try {
      await setDoc(doc(db, "rutas", name), {
        waypoints
      });
      alert("Ruta guardada exitosamente.");
      updateSavedRoutesDropdown();
    } catch (e) {
      console.error("Error al guardar:", e);
      alert("No se pudo guardar la ruta.");
    }
  }

  // Cargar rutas guardadas desde Firestore
  async function updateSavedRoutesDropdown() {
    savedRoutes.innerHTML = '';
    try {
      const snapshot = await getDocs(collection(db, "rutas"));
      snapshot.forEach(docSnap => {
        const option = document.createElement('option');
        option.value = docSnap.id;
        option.textContent = docSnap.id;
        savedRoutes.appendChild(option);
      });
    } catch (e) {
      console.error("Error al cargar rutas:", e);
    }
  }


  simulateBtn.addEventListener("click", async () => {
    const ruta = JSON.parse(localStorage.getItem("rutaCompleta"));
    if (!ruta || ruta.length < 2) {
      alert("Primero crea una ruta válida.");
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

    // Comprueba si busMarker existe antes de intentar eliminarlo
    if (busMarker) {
      map.removeLayer(busMarker);
      busMarker = null;
    }

    busMarker = L.marker([ruta[0].lat, ruta[0].lng], {
      icon: busIcon,
    }).addTo(map); // Usa el mapa accesible globalmente

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
      const result = await waitWhilePaused();
      if (result === "stopped") break;

      const punto = ruta[i];
      busMarker.setLatLng([punto.lat, punto.lng]);
      const progreso = ((i + 1) / totalPuntos) * 100;
      progressBar.style.width = `${progreso}%`;
      await new Promise(r => setTimeout(r, 300));
    }

    alert("Simulación terminada");
    progressBar.style.width = "0%";
  });

  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      window.location.href = "Usuario.html";
    });
  }
  // Inicial
  updateSavedRoutesDropdown();

});