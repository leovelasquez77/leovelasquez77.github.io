import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCBz2s5jDGtbNNpEQSVeqbkD85m6dTRWB0",
  authDomain: "ubix-81203.firebaseapp.com",
  projectId: "ubix-81203",
  storageBucket: "ubix-81203.appspot.com",
  messagingSenderId: "247852658625",
  appId: "1:247852658625:web:5dd6d4a09ca717267b0940",
  measurementId: "G-2Z859ZVS29"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Inicializar mapa
const map = L.map('map').setView([12.4379, -86.8780], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Referencias DOM
const routeSelector = document.getElementById('routeSelector');
const favoriteRoutes = document.getElementById('favoriteRoutes');
const addFavoriteBtn = document.getElementById('addFavoriteBtn');
const loadFavoriteBtn = document.getElementById('loadFavoriteBtn');
const bottomPanel = document.getElementById('bottomPanel');
const driverLocationInfo = document.getElementById('driverLocationInfo');

let routingControl = null;
let currentDriverMarker = null;

// Autenticación
const auth = getAuth();
let userId = null;

auth.onAuthStateChanged(user => {
  if (user) {
    userId = user.uid;
    loadUserFavorites();
  } else {
    alert("Debes iniciar sesión.");
    window.location.href = "index.html";
  }
});

// Cargar rutas generales
async function populateRoutes() {
  try {
    const snapshot = await getDocs(collection(db, "rutas"));
    snapshot.forEach(docSnap => {
      const routeData = docSnap.data();
      const name = docSnap.id;

      if (Array.isArray(routeData.waypoints) && routeData.waypoints.length > 1) {
        const option = document.createElement('option');
        option.value = name;
        option.innerHTML = `🚌 ${name}`;
        routeSelector.appendChild(option);
      }
    });
  } catch (e) {
    console.error("Error al cargar rutas desde Firestore:", e);
  }
}

// Cargar rutas favoritas del usuario
async function loadUserFavorites() {
  favoriteRoutes.innerHTML = ''; // Limpiar

  if (!userId) {
    favoriteRoutes.innerHTML = '<option value="">No autenticado</option>';
    loadFavoriteBtn.disabled = true;
    return;
  }

  const userFavoritesCollectionRef = collection(db, "rutas_favoritas", userId, "rutasFavoritas");

  try {
    const snapshot = await getDocs(userFavoritesCollectionRef);
    if (snapshot.empty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay favoritas añadidas';
      favoriteRoutes.appendChild(option);
      loadFavoriteBtn.disabled = true;
    } else {
      loadFavoriteBtn.disabled = false;
      snapshot.forEach(docSnap => {
        const routeName = docSnap.id;
        const option = document.createElement('option');
        option.value = routeName;
        option.textContent = routeName;
        favoriteRoutes.appendChild(option);
      });
    }
  } catch (e) {
    console.error("Error al cargar rutas favoritas del usuario:", e);
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Error al cargar favoritas';
    favoriteRoutes.appendChild(option);
    loadFavoriteBtn.disabled = true;
  }
}

// Mostrar ruta en mapa
async function showRoute(routeName) {
  let waypoints = [];

  try {
    const docRef = doc(db, "rutas", routeName);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data.waypoints)) {
        waypoints = data.waypoints;
      } else {
        throw new Error("La ruta no contiene un arreglo válido de waypoints.");
      }
    } else {
      alert('Ruta no encontrada en la base de datos.');
      return;
    }
  } catch (e) {
    console.error("Error al mostrar la ruta:", e);
    alert("Ocurrió un error al cargar la ruta.");
    return;
  }

  if (routingControl) map.removeControl(routingControl);
  routingControl = L.Routing.control({
    waypoints: waypoints.map(p => L.latLng(p.lat, p.lng)),
    lineOptions: {
      styles: [{ color: '#72C2E7', weight: 5 }]
    },
    routeWhileDragging: false,
    draggableWaypoints: false,
    addWaypoints: false,
    show: false
  }).addTo(map);

  map.fitBounds(L.latLngBounds(waypoints.map(p => L.latLng(p.lat, p.lng))));

  bottomPanel.classList.add('hide');
  setTimeout(() => bottomPanel.classList.remove('hide'), 5000);
}

// Eventos

routeSelector.addEventListener('change', () => {
  const selected = routeSelector.value;
  if (selected) showRoute(selected);
});

loadFavoriteBtn.addEventListener('click', () => {
  const selected = favoriteRoutes.value;
  if (!selected) {
    alert('Selecciona una ruta favorita.');
    return;
  }
  showRoute(selected);
});

addFavoriteBtn.addEventListener('click', async () => {
  const selectedRoute = routeSelector.value;
  if (!selectedRoute) {
    alert("Selecciona una ruta para añadir a favoritos.");
    return;
  }

  if (!userId) {
    alert("Usuario no autenticado.");
    return;
  }

  const favoriteRouteDocRef = doc(db, "rutas_favoritas", userId, "rutasFavoritas", selectedRoute);

  try {
    const docSnap = await getDoc(favoriteRouteDocRef);
    if (docSnap.exists()) {
      alert(`"${selectedRoute}" ya está en favoritos.`);
    } else {
      await setDoc(favoriteRouteDocRef, { addedAt: new Date() });
      alert(`"${selectedRoute}" añadido a favoritos.`);
      loadUserFavorites();
    }
  } catch (e) {
    console.error("Error al añadir a favoritos:", e);
    alert("Ocurrió un error al añadir la ruta a favoritos.");
  }
});

document.getElementById('closeSessionBtn').addEventListener('click', async () => {
  try {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      await signOut(auth);
      alert('Sesión cerrada exitosamente.');
      window.location.href = 'index.html';
    }
  } catch (e) {
    alert('Error al cerrar sesión.');
    console.error(e);
  }
});

// Eliminar ruta favorita
async function clearSelectedFavorite() {
  const selectedRoute = favoriteRoutes.value;
  if (!selectedRoute) {
    alert("Selecciona una ruta favorita para eliminar.");
    return;
  }

  if (!userId) {
    alert("Usuario no autenticado.");
    return;
  }

  const favoriteRouteDocRef = doc(db, "rutas_favoritas", userId, "rutasFavoritas", selectedRoute);

  try {
    await deleteDoc(favoriteRouteDocRef);
    alert(`La ruta favorita "${selectedRoute}" ha sido eliminada.`);
    loadUserFavorites();
  } catch (e) {
    console.error("Error al eliminar la ruta favorita:", e);
    alert("Ocurrió un error al eliminar la ruta favorita.");
  }
}

// Ubicación del conductor en tiempo real
const driverId = "conductor123";

function setupDriverLocationListener() {
  const driverRef = doc(db, "ubicacionesConductores", driverId);
  onSnapshot(driverRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const { lat, lng, timestamp } = data;
      const time = timestamp ? new Date(timestamp.seconds * 1000).toLocaleString() : "N/A";

      if (currentDriverMarker) {
        currentDriverMarker.setLatLng([lat, lng]);
      } else {
        const icon = L.icon({
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/61/61212.png',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        currentDriverMarker = L.marker([lat, lng], { icon }).addTo(map)
          .bindPopup(`<b>Conductor:</b> ${driverId}<br><b>Última actualización:</b> ${time}`)
          .openPopup();
      }

      driverLocationInfo.innerHTML = `
        <i class="fas fa-bus"></i> <b>Ubicación del Conductor:</b><br>
        Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}<br>
        Última actualización: ${time}
      `;
    } else {
      console.log("Ubicación no disponible para", driverId);
      driverLocationInfo.textContent = "Esperando ubicación del conductor...";
      if (currentDriverMarker) {
        map.removeLayer(currentDriverMarker);
        currentDriverMarker = null;
      }
    }
  }, (err) => {
    console.error("Error al escuchar ubicación:", err);
    driverLocationInfo.textContent = "Error al cargar ubicación del conductor.";
  });
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  populateRoutes();
  loadUserFavorites();
  setupDriverLocationListener();

  document.getElementById('clearFavoritesBtn').addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres eliminar la ruta favorita seleccionada?')) {
      clearSelectedFavorite();
    }
  });
});
