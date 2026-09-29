// src/App.jsx
import { useState, useEffect } from 'react';
import Header from './components/Header';
import ZohoSalesIQ from './components/ZohoSalesIQ';
import ChatPage from './pages/ChatPage';
import LandingPage from './pages/LandingPage';
import WidgetTestPage from './pages/WidgetTestPage';
import OperatorOnlyPage from './pages/OperatorOnlyPage';
import { isChatbotActive } from './api/chatbotSettings';

// Routing manuale leggero: il sito ha solo poche "pagine" fisse
// (chat AI principale, /landing per l'embed da Backoffice, e
// /widget-test per testare il widget reale), quindi evitiamo di
// aggiungere react-router-dom per così poco.
function getRoute() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export default function App() {
  const [route, setRoute] = useState(getRoute());
  // null = ancora in caricamento. Di proposito NON mostriamo nulla di
  // "provvisorio" (es. sempre ChatPage finché non arriva la risposta):
  // aspettiamo il flag reale per decidere subito la pagina giusta,
  // evitando un lampo di AI chat seguito da uno switch a Zoho (o
  // viceversa) che sarebbe confuso da vedere.
  const [chatbotActive, setChatbotActive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    isChatbotActive().then((active) => {
      if (!cancelled) setChatbotActive(active);
    });
    return () => { cancelled = true; };
  }, []);

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

  if (route === '/widget-test') {
    return <WidgetTestPage />;
  }

  // Il flag riguarda solo la pagina principale (chat AI vs Zoho
  // diretta): /landing e /widget-test restano invariate, non dipendono
  // da questo interruttore.
  return (
    <>
      <Header />
      <main className="page">
        {chatbotActive === null ? null : chatbotActive ? <ChatPage /> : <OperatorOnlyPage />}
      </main>
      <ZohoSalesIQ />
    </>
  );
}
