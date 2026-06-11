/**
 * PublicLocationMap — mapa Leaflet/OpenStreetMap de solo lectura para la
 * tarjeta "Dónde estamos" del catálogo público.
 *
 * Se renderiza únicamente cuando el negocio tiene lat/lng (guardados desde
 * el LocationPicker de /business-configuration). Toda la interacción está
 * deshabilitada y el contenedor lleva pointer-events: none: el click lo
 * captura el <a> padre de la tarjeta, que sigue abriendo Google Maps
 * (misma UX que el placeholder anterior, pero con mapa real detrás).
 *
 * Se importa con React.lazy desde CatalogStoreHeader para que leaflet +
 * react-leaflet no entren al bundle inicial del catálogo.
 */
import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mismo pin que LocationPicker (gota con color primario), pero con el color
// como parámetro: en el catálogo público el primario llega del theme, no de
// la CSS var --color-primary del panel.
function buildPinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 10px rgba(0,0,0,0.28);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function PublicLocationMap({ lat, lng, primaryColor = '#6366f1' }) {
  const position = [Number(lat), Number(lng)];
  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none', isolation: 'isolate' }} aria-hidden="true">
      <MapContainer
        center={position}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={position} icon={buildPinIcon(primaryColor)} interactive={false} />
      </MapContainer>
    </div>
  );
}
