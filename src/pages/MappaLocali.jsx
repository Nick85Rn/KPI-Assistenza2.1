// src/pages/MappaLocali.jsx
//
// Dettaglio geografico delle installazioni: mappa Italia con un pallino
// colorato per locale (colore = stato cliente), filtri per provincia/
// stato/piano sopra la mappa, popup con anagrafica e moduli attivi al
// click su un pallino.
//
// Indipendente dal TimeframeSelector: è uno stato attuale (snapshot),
// non una serie temporale filtrabile per periodo — stesso principio di
// Report/Impostazioni in App.jsx.
//
// Usa CircleMarker (non i marker-icona di default di Leaflet): più
// leggero con migliaia di punti, ed evita il problema noto delle icone
// di default che non si caricano correttamente con bundler come Vite.

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  AlertCircle,
  Filter,
  X,
  Phone as PhoneIcon,
  MessageCircle,
  Wifi,
  Smartphone,
  ClipboardList,
  Link as LinkIcon,
  Repeat,
} from "lucide-react";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { getLocaliMappa } from "../api/zohoData";

// Centro/zoom iniziale: Italia intera
const ITALY_CENTER = [42.5, 12.5];
const ITALY_ZOOM = 6;

// Colore del pallino in base allo stato cliente. Il modulo Locali ha
// diversi stati testuali liberi (vedi query esplorative fatte in
// sessione: GESTITO, PARZIALMENTE ATTIVO, NUOVO, DISDETTO, ecc.) —
// li raggruppiamo in 4 macro-categorie visive.
const STATO_GROUPS = {
  attivo: { color: "#16a34a", label: "Attivo" },       // verde
  parziale: { color: "#f59e0b", label: "Parziale/Nuovo" }, // ambra
  disdetto: { color: "#dc2626", label: "Disdetto" },   // rosso
  altro: { color: "#94a3b8", label: "Altro/Non definito" }, // grigio
};

function statoGroup(statoCliente, attivo) {
  const s = (statoCliente || "").toUpperCase();
  if (s.includes("DISDETT")) return "disdetto";
  if (s.includes("PARZIAL") || s.includes("NUOVO")) return "parziale";
  if (s.includes("GESTITO") || attivo === true) return "attivo";
  return "altro";
}

const MODULI = [
  { key: "voice_pro_attivo", label: "Voice Pro / Centralino", icon: PhoneIcon },
  { key: "whatsapp_attivo", label: "WhatsApp", icon: MessageCircle },
  { key: "wifi_attivo", label: "WiFi", icon: Wifi },
  { key: "app_clienti_attivo", label: "App Clienti", icon: Smartphone },
  { key: "mansionissimo_attivo", label: "Mansionissimo", icon: ClipboardList },
  { key: "catenaria_attiva", label: "Catenaria", icon: LinkIcon },
  { key: "remarketing_attivo", label: "Remarketing", icon: Repeat },
];

export default function MappaLocali() {
  const [locali, setLocali] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filtroProvincia, setFiltroProvincia] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroLicenza, setFiltroLicenza] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getLocaliMappa().then(({ locali, error }) => {
      if (!mounted) return;
      setLocali(locali);
      setError(error);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const { province, stati, licenze } = useMemo(() => {
    const p = new Set();
    const s = new Set();
    const l = new Set();
    for (const loc of locali ?? []) {
      if (loc.provincia) p.add(loc.provincia);
      if (loc.stato_cliente) s.add(loc.stato_cliente);
      if (loc.tipo_licenza) l.add(loc.tipo_licenza);
    }
    return {
      province: [...p].sort(),
      stati: [...s].sort(),
      licenze: [...l].sort(),
    };
  }, [locali]);

  const filtrati = useMemo(() => {
    if (!locali) return [];
    return locali.filter((loc) => {
      if (filtroProvincia && loc.provincia !== filtroProvincia) return false;
      if (filtroStato && loc.stato_cliente !== filtroStato) return false;
      if (filtroLicenza && loc.tipo_licenza !== filtroLicenza) return false;
      return true;
    });
  }, [locali, filtroProvincia, filtroStato, filtroLicenza]);

  const conCoordinate = useMemo(
    () => filtrati.filter((l) => l.lat != null && l.lng != null),
    [filtrati]
  );

  const hasActiveFilters = filtroProvincia || filtroStato || filtroLicenza;

  function resetFiltri() {
    setFiltroProvincia("");
    setFiltroStato("");
    setFiltroLicenza("");
  }

  if (loading) {
    return <Loading size="lg" label="Caricamento locali..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle
          title="Mappa installazioni"
          hint={`${filtrati.length.toLocaleString("it-IT")} locali${
            hasActiveFilters ? " (filtrati)" : ""
          } — ${conCoordinate.length.toLocaleString("it-IT")} geolocalizzati sulla mappa`}
        />

        {/* Filtri */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
            <Filter size={16} />
            Filtri
            {hasActiveFilters && (
              <button
                onClick={resetFiltri}
                className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <X size={12} />
                Azzera filtri
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FilterSelect
              label="Provincia"
              value={filtroProvincia}
              onChange={setFiltroProvincia}
              options={province}
            />
            <FilterSelect
              label="Stato cliente"
              value={filtroStato}
              onChange={setFiltroStato}
              options={stati}
            />
            <FilterSelect
              label="Piano/Licenza"
              value={filtroLicenza}
              onChange={setFiltroLicenza}
              options={licenze}
            />
          </div>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
          {Object.values(STATO_GROUPS).map((g) => (
            <div key={g.label} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: g.color }}
              />
              <span className="text-slate-600">{g.label}</span>
            </div>
          ))}
        </div>

        {/* Mappa */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" style={{ height: 600 }}>
          <MapContainer
            center={ITALY_CENTER}
            zoom={ITALY_ZOOM}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {conCoordinate.map((loc) => {
              const group = statoGroup(loc.stato_cliente, loc.attivo);
              const color = STATO_GROUPS[group].color;
              return (
                <CircleMarker
                  key={loc.zoho_locale_id}
                  center={[loc.lat, loc.lng]}
                  radius={6}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.75,
                    weight: 1.5,
                  }}
                >
                  <Popup>
                    <LocalePopup locale={loc} />
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {filtrati.length > conCoordinate.length && (
          <div className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {(filtrati.length - conCoordinate.length).toLocaleString("it-IT")} locali nel filtro
            corrente non hanno ancora coordinate geografiche (indirizzo mancante o in
            attesa di geocodifica) e non compaiono sulla mappa.
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
      >
        <option value="">Tutti</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function LocalePopup({ locale: loc }) {
  const moduliAttivi = MODULI.filter((m) => loc[m.key] === true);
  const indirizzoCompleto = [loc.indirizzo, loc.citta, loc.provincia]
    .filter(Boolean)
    .join(", ");

  return (
    <div style={{ minWidth: 220, fontFamily: "inherit" }}>
      <div className="font-bold text-sm text-slate-900 mb-1">{loc.nome_locale}</div>
      {loc.ragione_sociale && (
        <div className="text-xs text-slate-500 mb-2">{loc.ragione_sociale}</div>
      )}

      {indirizzoCompleto && (
        <div className="flex items-start gap-1.5 text-xs text-slate-600 mb-2">
          <MapPin size={12} className="mt-0.5 flex-shrink-0" />
          <span>{indirizzoCompleto}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2">
        {loc.stato_cliente && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
            {loc.stato_cliente}
          </span>
        )}
        {loc.tipo_licenza && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 uppercase">
            {loc.tipo_licenza}
          </span>
        )}
      </div>

      {moduliAttivi.length > 0 ? (
        <div className="border-t border-slate-100 pt-2 mt-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">
            Moduli attivi
          </div>
          <div className="flex flex-col gap-1">
            {moduliAttivi.map((m) => (
              <div key={m.key} className="flex items-center gap-1.5 text-xs text-slate-700">
                <m.icon size={12} className="text-emerald-600" />
                {m.label}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 border-t border-slate-100 pt-2 mt-2">
          Nessun modulo aggiuntivo attivo
        </div>
      )}
    </div>
  );
}
