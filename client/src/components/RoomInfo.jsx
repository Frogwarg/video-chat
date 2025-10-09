import { useState } from 'react';
import { Users, Copy, Check, Crown } from 'lucide-react';
import styles from '../App.module.css';

export default function RoomInfo({ currentRoom, isOwner, connectionStatus }) {
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.roomInfo}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {isOwner && <Crown style={{ width: '1.25rem', height: '1.25rem', color: '#fbbf24' }} />}
        <Users style={{ width: '1.25rem', height: '1.25rem', color: '#c084fc' }} />
        <div>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>ID комнаты:</p>
          <p style={{ fontFamily: 'monospace', fontWeight: '600' }}>{currentRoom}</p>
        </div>
        {connectionStatus && (
          <div style={{ textAlign: 'center', fontSize: '0.875rem', marginTop: '-1.5rem' }}>
            {connectionStatus}
          </div>
        )}
      </div>
      <button
        onClick={copyRoomId}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#334155', borderRadius: '0.5rem', border: 'none', color: 'white', cursor: 'pointer' }}
      >
        {copied ? <Check style={{ width: '1rem', height: '1rem' }} /> : <Copy style={{ width: '1rem', height: '1rem' }} />}
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
    </div>
  );
}