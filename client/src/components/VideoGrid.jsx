import { VideoOff, Mic, MicOff, Video, VideoOff as VideoOffIcon, PhoneOff, Crown } from 'lucide-react';
import styles from '../../src/App.module.css';

export default function VideoGrid({
  localVideoRef,
  remoteVideosRef,
  localStreamRef,
  peers,
  isOwner,
  roomOwner,
  peerStates,
  localStreamReady,
  videoEnabled,
  hasVideo,
  audioEnabled,
  audioLevel,
  sendMutePeer,
  sendKickPeer,
}) {
  return (
    <div className={styles.videoGrid}>
      <div className={styles.videoBox}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={styles.videoMirror}
          style={{ display: (localStreamReady && localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0 && videoEnabled) ? 'block' : 'none' }}
        />
        {(!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0 || !videoEnabled) && (
          <div className={styles.videoOffOverlay}>
            <VideoOff style={{ width: '4rem', height: '4rem', color: '#9ca3af' }} />
            <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              {hasVideo ? 'Камера выключена' : 'Нет камеры'}
            </span>
          </div>
        )}
        <div className={styles.videoLabel}>Вы</div>
        {audioEnabled && audioLevel > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '3rem',
            left: '1rem',
            right: '1rem',
            height: '4px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${audioLevel}%`,
              background: '#10b981',
              transition: 'width 0.1s'
            }} />
          </div>
        )}
      </div>

      {Object.entries(peers).map(([peerId, stream], index) => (
        <div key={peerId} className={styles.videoBox}>
          {stream && remoteVideosRef.current[peerId]?.srcObject ? (
            <video
              ref={el => {
                if (el && remoteVideosRef.current[peerId]) {
                  el.srcObject = remoteVideosRef.current[peerId].srcObject;
                  el.play().catch(e => console.log(`Play error for peer ${peerId}:`, e));
                }
              }}
              autoPlay
              playsInline
              className={styles.video}
              volume={1.0}
            />
          ) : (
            <div className={styles.videoOffOverlay}>
              <VideoOff style={{ width: '4rem', height: '4rem', color: '#9ca3af' }} />
              <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                Участник без видео
              </span>
            </div>
          )}
          {isOwner && peerId !== roomOwner && (
            <div className={styles.ownerControls}>
              <button onClick={() => sendMutePeer(peerId, 'audio')} title={peerStates[peerId]?.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}>
                {peerStates[peerId]?.audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
              </button>
              <button onClick={() => sendMutePeer(peerId, 'video')} title={peerStates[peerId]?.videoEnabled ? 'Выключить видео' : 'Включить видео'}>
                {peerStates[peerId]?.videoEnabled ? <Video size={16} /> : <VideoOffIcon size={16} />}
              </button>
              <button onClick={() => sendKickPeer(peerId)} title="Исключить">
                <PhoneOff size={16} />
              </button>
            </div>
          )}
          <div className={styles.videoLabel}>
            Участник {index + 1} {peerId === roomOwner ? <Crown style={{ width: '1rem', height: '1rem', color: '#fbbf24' }} /> : ''}
          </div>
        </div>
      ))}
    </div>
  );
}