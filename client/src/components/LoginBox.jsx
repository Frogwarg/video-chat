import { AlertCircle } from 'lucide-react';
import styles from '../../src/App.module.css';

export default function LoginBox({ roomId, setRoomId, serverIp, setServerIp, userName, setUserName, joinRoom, errorMessage }) {
  return (
    <div className={styles.loginBox}>
      {errorMessage && (
        <div className={styles.errorBox}>
          <AlertCircle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0, marginTop: '0.125rem' }} />
          <div>{errorMessage}</div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#d1d5db' }}>
          IP-адрес сервера
        </label>
        <input
          type="text"
          value={serverIp}
          onChange={(e) => setServerIp(e.target.value)}
          placeholder="Например, 192.168.0.108:3000"
          className={styles.input}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#d1d5db' }}>
          ID комнаты
        </label>
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Введите ID комнаты"
          className={styles.input}
          onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#d1d5db' }}>
          Ваше имя
        </label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Введите ваше имя"
          className={styles.input}
          maxLength={30}
        />
      </div>

      <button
        onClick={joinRoom}
        disabled={!roomId.trim() || !serverIp.trim()}
        className={roomId.trim() && serverIp.trim() ? styles.joinButton : styles.joinButtonDisabled}
        onMouseOver={(e) => roomId.trim() && serverIp.trim() && (e.target.style.transform = 'scale(1.05)')}
        onMouseOut={(e) => (e.target.style.transform = 'scale(1)')}
      >
        Присоединиться к звонку
      </button>
    </div>
  );
}