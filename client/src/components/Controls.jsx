import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import styles from '../App.module.css';

export default function Controls({
  videoEnabled,
  audioEnabled,
  hasVideo,
  hasAudio,
  toggleVideo,
  toggleAudio,
  leaveRoom,
}) {
  return (
    <div className={styles.controls}>
      <button
        onClick={toggleVideo}
        disabled={!hasVideo}
        className={videoEnabled && hasVideo ? styles.controlButton : styles.controlButtonActive}
        onMouseOver={(e) => hasVideo && (e.target.style.opacity = '0.8')}
        onMouseOut={(e) => (e.target.style.opacity = '1')}
      >
        {videoEnabled ? <Video style={{ width: '1.5rem', height: '1.5rem' }} /> : <VideoOff style={{ width: '1.5rem', height: '1.5rem' }} />}
      </button>

      <button
        onClick={toggleAudio}
        disabled={!hasAudio}
        className={audioEnabled && hasAudio ? styles.controlButton : styles.controlButtonActive}
        onMouseOver={(e) => hasAudio && (e.target.style.opacity = '0.8')}
        onMouseOut={(e) => (e.target.style.opacity = '1')}
      >
        {audioEnabled ? <Mic style={{ width: '1.5rem', height: '1.5rem' }} /> : <MicOff style={{ width: '1.5rem', height: '1.5rem' }} />}
      </button>

      <button
        onClick={leaveRoom}
        className={styles.endCallButton}
        onMouseOver={(e) => e.target.style.opacity = '0.8'}
        onMouseOut={(e) => e.target.style.opacity = '1'}
      >
        <PhoneOff style={{ width: '1.5rem', height: '1.5rem' }} />
      </button>
    </div>
  );
}