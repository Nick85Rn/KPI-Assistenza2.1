// src/pages/OperatorOnlyPage.jsx
//
// Mostrata al posto della chat AI quando chatbot_settings.is_active è
// false (interruttore gestito dalla dashboard KPI): apre subito la
// chat Zoho nativa, senza passare dall'AI.

import { useEffect } from 'react';
import { IconMessageCircle } from '@tabler/icons-react';
import { openZohoChat } from '../components/Header';

export default function OperatorOnlyPage() {
  useEffect(() => {
    openZohoChat();
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: '60vh',
        textAlign: 'center',
        padding: '0 24px',
        color: 'var(--text-secondary, #666)',
      }}
    >
      <IconMessageCircle size={40} style={{ color: 'var(--primary)' }} />
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text, #1a1a1a)', marginBottom: 6 }}>
          Ti stiamo mettendo in contatto con un operatore
        </div>
        <div style={{ fontSize: 14 }}>
          Se la finestra di chat non si apre da sola, usa il pulsante in basso a destra.
        </div>
      </div>
    </div>
  );
}
