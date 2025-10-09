import { VideoOff, Mic, MicOff, Video, VideoOff as VideoOffIcon, PhoneOff, Crown } from 'lucide-react';
import styles from '../App.module.css';
import React from 'react';

const LocalVideoBox = React.memo(function LocalVideoBox({
  localVideoRef,
  localStreamRef,
  localStreamReady,
  videoEnabled,
  hasVideo,
  audioEnabled,
  audioLevel,
  myUserName,
}) {
  return (
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
      <div className={styles.videoLabel}>
        {myUserName || 'Вы'} (Вы)
      </div>
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
  );
});

const PeerVideoBox = React.memo(function PeerVideoBox({
  peerId,
  stream,
  isOwner,
  roomOwner,
  peerState,
  peerName,
  sendMutePeer,
  sendKickPeer,
}) {
  return (
    <div key={peerId} className={styles.videoBox}>
      {stream && peerState?.videoEnabled ? (
        <video
          ref={el => {
            if (el) {
              el.srcObject = stream;
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
          <button onClick={() => sendMutePeer(peerId, 'audio')} title={peerState?.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}>
            {peerState?.audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button onClick={() => sendMutePeer(peerId, 'video')} title={peerState?.videoEnabled ? 'Выключить видео' : 'Включить видео'}>
            {peerState?.videoEnabled ? <Video size={16} /> : <VideoOffIcon size={16} />}
          </button>
          <button onClick={() => sendKickPeer(peerId)} title="Исключить">
            <PhoneOff size={16} />
          </button>
        </div>
      )}
      <div className={styles.videoLabel}>
        {peerName || 'Участник'} {peerId === roomOwner && <Crown style={{ width: '1rem', height: '1rem', color: '#fbbf24', display: 'inline-block', marginLeft: '0.25rem' }} />}
      </div>
    </div>
  );
});

export default function VideoGrid({
  localVideoRef,
  remoteVideosRef,
  localStreamRef,
  peers,
  isOwner,
  roomOwner,
  peerStates,
  peerNames,
  myUserName,
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
      <LocalVideoBox
        localVideoRef={localVideoRef}
        localStreamRef={localStreamRef}
        localStreamReady={localStreamReady}
        videoEnabled={videoEnabled}
        hasVideo={hasVideo}
        audioEnabled={audioEnabled}
        audioLevel={audioLevel}
        myUserName={myUserName}
      />

      {peers && typeof peers === 'object' && Object.entries(peers).length > 0 ? (
        Object.entries(peers).map(([peerId, stream]) => (
          <PeerVideoBox
            key={peerId}
            peerId={peerId}
            stream={stream}
            isOwner={isOwner}
            roomOwner={roomOwner}
            peerState={peerStates?.[peerId]}
            peerName={peerNames?.[peerId]}
            sendMutePeer={sendMutePeer}
            sendKickPeer={sendKickPeer}
          />
        ))
      ) : null}
    </div>
  );
}