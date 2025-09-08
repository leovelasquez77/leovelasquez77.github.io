
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth,signOut} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import {    
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query, // Importar query
  where // Importar where
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

// ✨ Define un ID de usuario para almacenar favoritos. En una aplicación real, esto sería dinámico.
const userId = "usuarioDemo123"; // Puedes cambiar esto según tu sistema de usuarios

// 🧭 Función para cargar rutas desde Firestore y mostrarlas en el selector principal
async function populateRoutes() {
  try {
    const snapshot = await getDocs(collection(db, "rutas"));
    snapshot.forEach(docSnap => {
      const routeData = docSnap.data();
      const name = docSnap.id;

      // Validar que existan puntos
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

// ⭐ Función para cargar rutas favoritas del usuario desde Firestore
async function loadUserFavorites() {
  favoriteRoutes.innerHTML = ''; // Limpiar opciones existentes
  const userFavoritesCollectionRef = collection(db, "usuarios", userId, "rutasFavoritas");
  try {
    const snapshot = await getDocs(userFavoritesCollectionRef);
    if (snapshot.empty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay favoritas añadidas';
      favoriteRoutes.appendChild(option);
      loadFavoriteBtn.disabled = true; // Deshabilitar botón si no hay favoritos
    } else {
      loadFavoriteBtn.disabled = false; // Habilitar botón si hay favoritos
      snapshot.forEach(docSnap => {
        const routeName = docSnap.id; // El ID del documento es el nombre de la ruta
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

// 📍 Función para mostrar la ruta seleccionada en el mapa
async function showRoute(routeName) {
  let waypoints = [];

  // Intenta cargar la ruta desde Firestore
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

  // Mostrar en el mapa
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

  // Mostrar panel temporalmente
  bottomPanel.classList.add('hide'); // Asegúrate de tener esta clase CSS para ocultar
  setTimeout(() => bottomPanel.classList.remove('hide'), 5000);
}

// 🎯 Escuchadores de eventos

// Cuando se selecciona una ruta en el selector principal, la muestra.
routeSelector.addEventListener('change', () => {
  const selected = routeSelector.value;
  if (selected) showRoute(selected);
});

// Cuando se hace clic en "Ver Ruta" para un favorito.
loadFavoriteBtn.addEventListener('click', () => {
  const selected = favoriteRoutes.value;
  if (!selected) {
    alert('Selecciona una ruta favorita.');
    return;
  }
  showRoute(selected);
});

// Cuando se hace clic en "Añadir a Favoritos".
addFavoriteBtn.addEventListener('click', async () => {
  const selectedRoute = routeSelector.value;
  if (!selectedRoute) {
    alert("Selecciona una ruta para añadir a favoritos.");
    return;
  }



  // Referencia al documento de la ruta favorita
  const favoriteRouteDocRef = doc(db, "usuarios", userId, "rutasFavoritas", selectedRoute);

  try {
    const docSnap = await getDoc(favoriteRouteDocRef);
    if (docSnap.exists()) {
      alert(`"${selectedRoute}" ya está en favoritos.`);
    } else {
      // Guardar la ruta favorita en Firestore.
      // El ID del documento será el nombre de la ruta, y el contenido puede ser vacío o un objeto simple.
      await setDoc(favoriteRouteDocRef, { addedAt: new Date() });
      alert(`"${selectedRoute}" añadido a favoritos.`);
      loadUserFavorites(); // Recargar la lista de favoritos para mostrar el nuevo
    }
  } catch (e) {
    console.error("Error al añadir a favoritos:", e);
    alert("Ocurrió un error al añadir la ruta a favoritos.");
  }
});

// Cerrar sesión al hacer clic en el botón
document.getElementById('closeSessionBtn').addEventListener('click', async () => {
    const auth = getAuth();
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


// 🗑️ Función para limpiar las rutas favoritas del usuario
 async function clearSelectedFavorite() {
  const selectedRoute = favoriteRoutes.value;
  if (!selectedRoute) {
    alert("Selecciona una ruta favorita para eliminar.");
    return;
  }

  const favoriteRouteDocRef = doc(db, "usuarios", userId, "rutasFavoritas", selectedRoute);

  try {
    await deleteDoc(favoriteRouteDocRef);
    alert(`La ruta favorita "${selectedRoute}" ha sido eliminada.`);
    loadUserFavorites(); // Recarga la lista para actualizar el selector
  } catch (e) {
    console.error("Error al eliminar la ruta favorita:", e);
    alert("Ocurrió un error al eliminar la ruta favorita.");
  }
}
// 🚐 Escuchar ubicación del conductor en tiempo real
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

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  populateRoutes(); // Carga las rutas generales
  loadUserFavorites(); // Carga las rutas favoritas del usuario
  setupDriverLocationListener();

    document.getElementById('clearFavoritesBtn').addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres eliminar la ruta favorita seleccionada?')) {
      clearSelectedFavorite();
    }
  });
});