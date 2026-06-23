// src/App.jsx
import { useState, useEffect } from 'react';
import Header from './components/Header';
import ZohoSalesIQ from './components/ZohoSalesIQ';
import ChatPage from './pages/ChatPage';
import LandingPage from './pages/LandingPage';

// Routing manuale leggero: il sito ha solo 2 "pagine" fisse
// (chat AI principale, e /landing per l'embed da Backoffice),
// quindi evitiamo di aggiungere react-router-dom per così poco.
function getRoute() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    function onPopState() {
      setRoute(getRoute());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (route === '/landing') {
    return <LandingPage />;
  }

  return (
    <>
      <Header />
      <main className="page">
        <ChatPage />
      </main>
      <ZohoSalesIQ />
    </>
  );
}
