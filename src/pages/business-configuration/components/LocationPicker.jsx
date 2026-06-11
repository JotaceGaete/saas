import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from 'components/AppIcon';

// Fix Leaflet default marker icons (Vite asset path issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function getPrimaryMarker() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:var(--color-primary,#6366f1);
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 10px rgba(0,0,0,0.28);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/** Keeps map view centered when position changes */
function MapRecenterer({ position }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!position) return;
    const [lat, lng] = position;
    const same = prev.current && prev.current[0] === lat && prev.current[1] === lng;
    if (!same) { map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true }); prev.current = position; }
  }, [position, map]);
  return null;
}

/** Handles click on map + drag of marker */
function MapInteraction({ position, onPositionChange }) {
  const markerRef = useRef(null);
  useMapEvents({
    click(e) { onPositionChange([e.latlng.lat, e.latlng.lng]); },
  });
  if (!position) return null;
  return (
    <Marker
      draggable
      position={position}
      ref={markerRef}
      icon={getPrimaryMarker()}
      eventHandlers={{
        dragend() {
          const ll = markerRef.current?.getLatLng();
          if (ll) onPositionChange([ll.lat, ll.lng]);
        },
      }}
    />
  );
}

/* ── Nominatim helpers ────────────────────────────────────────────────────── */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOM_HEADERS    = { 'Accept-Language': 'es', 'User-Agent': 'WalinkaApp/1.0' };

async function searchAddress(q) {
  const p = new URLSearchParams({ q, format: 'json', limit: 6, addressdetails: 1 });
  const r = await fetch(`${NOMINATIM_BASE}/search?${p}`, { headers: NOM_HEADERS });
  if (!r.ok) throw new Error('search_error');
  return r.json();
}

async function reverseAddress(lat, lng) {
  const p = new URLSearchParams({ lat, lon: lng, format: 'json', addressdetails: 1 });
  const r = await fetch(`${NOMINATIM_BASE}/reverse?${p}`, { headers: NOM_HEADERS });
  if (!r.ok) throw new Error('reverse_error');
  return r.json();
}

function parseNominatim(result) {
  const a = result.address || {};
  const street  = [a.road, a.house_number].filter(Boolean).join(' ');
  const city    = a.city || a.town || a.village || a.municipality || a.county || '';
  const region  = a.state || a.region || '';
  const country = a.country || '';
  const address = street || result.display_name?.split(',')[0] || '';
  return { address, city, region, country };
}

/* ── InfoCard ──────────────────────────────────────────────────────────────── */

function InfoCard({ icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl border"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--color-muted)' }}>
        <Icon name={icon} size={13} color="var(--color-muted-foreground)" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {label}
        </p>
        <p className={`text-xs mt-0.5 break-words ${mono ? 'font-mono text-[11px]' : 'font-medium'}`}
          style={{ color: 'var(--color-foreground)', fontFamily: mono ? 'monospace' : 'var(--font-caption)' }}>
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

/* ── Catalog location card preview ─────────────────────────────────────────── */

function LocationCardPreview({ address, city, region, mapsUrl, primaryColor }) {
  const line1 = address || '';
  const line2 = [city, region].filter(Boolean).join(', ');
  return (
    <div className="rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }}>
      <div className="grid sm:grid-cols-[1fr_1.1fr]">
        {/* Visual map side */}
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="group relative min-h-[120px] flex items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#ECFDF5 0%,#F8FAFC 52%,#FFF7ED 100%)' }}
          aria-label="Ver en Google Maps">
          <div className="absolute inset-0 opacity-60 pointer-events-none">
            <div className="absolute left-[-10%] top-[22%] h-px w-[120%] rotate-[-10deg] bg-white/80" />
            <div className="absolute left-[-14%] top-[60%] h-px w-[130%] rotate-[8deg] bg-white/80" />
            <div className="absolute left-[18%] top-[-15%] h-[140%] w-px rotate-[16deg] bg-white/80" />
            <div className="absolute right-[20%] top-[-12%] h-[130%] w-px rotate-[-20deg] bg-white/80" />
          </div>
          <span className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm"
            style={{ background: 'rgba(255,255,255,0.9)', color: primaryColor }}>
            Ver mapa
          </span>
          <div className="relative z-10 group-hover:scale-110 transition-transform">
            <div className="w-10 h-10 rounded-full border-2 border-white shadow flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}>
              <Icon name="MapPin" size={18} color="#fff" />
            </div>
          </div>
        </a>

        {/* Info side */}
        <div className="p-4 flex flex-col justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#94a3b8' }}>
              Ubicación
            </p>
            {line1 && <p className="text-sm font-semibold" style={{ color: '#1e293b' }}>{line1}</p>}
            {line2 && <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{line2}</p>}
          </div>
          <div className="flex gap-2">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <Icon name="Navigation" size={12} color={primaryColor} />
              Cómo llegar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

/**
 * LocationPicker
 *
 * Props:
 *   value: { address, city, region, lat, lng }
 *   onChange: ({ address, city, region, lat, lng }) => void
 *   primaryColor: string
 */
export default function LocationPicker({ value, onChange, primaryColor = 'var(--color-primary)' }) {
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searchErr, setSearchErr]   = useState('');
  const [showDrop, setShowDrop]     = useState(false);
  const [position, setPosition]     = useState(null);
  const [detected, setDetected]     = useState(null);
  const [reverseLoading, setRevLoad] = useState(false);

  const debounce = useRef(null);
  const wrapRef  = useRef(null);

  // Init from saved value on mount
  useEffect(() => {
    if (value?.lat && value?.lng) {
      setPosition([value.lat, value.lng]);
      if (value.address || value.city) {
        setDetected({ address: value.address, city: value.city, region: value.region, country: '' });
        setQuery([value.address, value.city, value.region].filter(Boolean).join(', '));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close suggestions on outside click
  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const applyNominatimResult = useCallback((result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const fields = parseNominatim(result);
    setPosition([lat, lng]);
    setDetected(fields);
    setQuery(result.display_name || '');
    setShowDrop(false);
    onChange({ ...fields, lat, lng });
  }, [onChange]);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    setSearchErr('');
    clearTimeout(debounce.current);
    if (q.trim().length < 3) { setSuggestions([]); setShowDrop(false); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchAddress(q);
        setSuggestions(res);
        setShowDrop(res.length > 0);
      } catch { setSearchErr('No se pudo buscar. Intentá de nuevo.'); }
      finally { setSearching(false); }
    }, 500);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setSearchErr('');
    try {
      const res = await searchAddress(query);
      if (!res.length) { setSearchErr('No se encontraron resultados.'); return; }
      applyNominatimResult(res[0]);
    } catch { setSearchErr('Error al buscar. Verificá tu conexión.'); }
    finally { setSearching(false); }
  };

  const handleMapPositionChange = useCallback(async ([lat, lng]) => {
    setPosition([lat, lng]);
    setRevLoad(true);
    try {
      const result = await reverseAddress(lat, lng);
      const fields = parseNominatim(result);
      setDetected(fields);
      setQuery(result.display_name || '');
      onChange({ ...fields, lat, lng });
    } catch { onChange({ lat, lng }); }
    finally { setRevLoad(false); }
  }, [onChange]);

  const hasLocation = Boolean(position && detected);
  const mapsUrl = position
    ? `https://www.google.com/maps/search/?api=1&query=${position[0]},${position[1]}`
    : '';

  return (
    <div className="flex flex-col gap-5">

      {/* ── Step 1: Search field ── */}
      <div ref={wrapRef} className="relative">
        <p className="text-xs font-semibold mb-2 uppercase tracking-wide"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Paso 1 · Buscar dirección
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {searching
                ? <Icon name="Loader2" size={15} color="var(--color-muted-foreground)" className="animate-spin" />
                : <Icon name="Search"  size={15} color="var(--color-muted-foreground)" />}
            </div>
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
              onFocus={() => suggestions.length > 0 && setShowDrop(true)}
              placeholder="Mitre 5600, Wilde  ·  Av. Libertador 1234  ·  Calle Falsa 123"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-shadow"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-caption)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: primaryColor, fontFamily: 'var(--font-caption)' }}
          >
            Buscar
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {showDrop && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-[9999] rounded-xl border shadow-xl overflow-hidden"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            {suggestions.map((s, i) => (
              <button
                key={s.place_id || i}
                type="button"
                onMouseDown={() => applyNominatimResult(s)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
              >
                <Icon name="MapPin" size={13} color="var(--color-muted-foreground)" className="mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2 text-xs">{s.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {searchErr && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
            {searchErr}
          </p>
        )}
      </div>

      {/* ── Step 2: Interactive map ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Paso 2 · Ajustar en el mapa
          </p>
          {reverseLoading && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="Loader2" size={11} className="animate-spin" color="currentColor" />
              Detectando…
            </span>
          )}
        </div>

        <div className="rounded-xl overflow-hidden border relative" style={{ height: 280, borderColor: 'var(--color-border)' }}>
          {/* Placeholder when no position yet */}
          {!position && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ backgroundColor: 'var(--color-muted)', opacity: 0.92 }}>
              <Icon name="MapPin" size={28} color="var(--color-muted-foreground)" />
              <p className="text-xs text-center px-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Buscá una dirección arriba o hacé clic en el mapa para colocar el pin
              </p>
            </div>
          )}

          <MapContainer
            center={position || [-34.6, -58.4]}
            zoom={position ? 15 : 4}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapRecenterer position={position} />
            <MapInteraction position={position} onPositionChange={handleMapPositionChange} />
          </MapContainer>
        </div>

        <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Hacé clic en el mapa para mover el pin. También podés arrastrarlo para mayor precisión.
        </p>
      </div>

      {/* ── Step 3: Detected info ── */}
      {hasLocation && (
        <div>
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Paso 3 · Información detectada
          </p>
          <div className="grid grid-cols-2 gap-2">
            <InfoCard icon="MapPin"    label="Dirección"    value={detected.address} />
            <InfoCard icon="Building2" label="Ciudad"       value={detected.city} />
            <InfoCard icon="Globe"     label="País"         value={detected.country} />
            <InfoCard icon="Compass"   label="Coordenadas"  value={`${position[0].toFixed(5)}, ${position[1].toFixed(5)}`} mono />
          </div>
        </div>
      )}

      {/* ── Step 4: Catalog preview ── */}
      {hasLocation && (
        <div>
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Paso 4 · Vista previa en tu catálogo
          </p>
          <LocationCardPreview
            address={detected.address}
            city={detected.city}
            region={detected.region}
            mapsUrl={mapsUrl}
            primaryColor={primaryColor === 'var(--color-primary)' ? '#6366f1' : primaryColor}
          />
        </div>
      )}
    </div>
  );
}
