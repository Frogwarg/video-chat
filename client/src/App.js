import { useState, useRef } from 'react';
import styles from '../../src/App.module.css';
import LoginBox from './components/LoginBox.jsx';
import RoomInfo from './components/RoomInfo.jsx';
import VideoGrid from './components/VideoGrid.jsx';
import Controls from './components/Controls.jsx';
import useWebRTC from './hooks/useWebRTC.js';

export default function VideoChat() {
  const [roomId, setRoomId] = useState('');
  const [serverIp, setServerIp] = useState('192.168.0.108:3000');
  const [currentRoom, setCurrentRoom] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});

  const {
    videoEnabled,
    audioEnabled,
    peers,
    connectionStatus,
    hasVideo,
    hasAudio,
    localStreamReady,
    audioLevel,
    isOwner,
    roomOwner,
    peerStates,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    sendMutePeer,
    sendKickPeer,
  } = useWebRTC({
    serverIp,
    roomId,
    currentRoom,
    setCurrentRoom,
    setIsInCall,
    setErrorMessage,
    localVideoRef,
    localStreamRef,
    peerConnectionsRef,
    remoteVideosRef,
    isInCall
  });

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        <div className={styles.header}>
          <h1 className={styles.title}>VideoConnect</h1>
          <p className={styles.subtitle}>Локальная видеосвязь в сети LAN</p>
        </div>

        {!isInCall ? (
          <LoginBox
            roomId={roomId}
            setRoomId={setRoomId}
            serverIp={serverIp}
            setServerIp={setServerIp}
            joinRoom={joinRoom}
            errorMessage={errorMessage}
          />
        ) : (
          <>
            <RoomInfo
              currentRoom={currentRoom}
              isOwner={isOwner}
              connectionStatus={connectionStatus}
            />
            <VideoGrid
              localVideoRef={localVideoRef}
              remoteVideosRef={remoteVideosRef}
              localStreamRef={localStreamRef}
              peers={peers}
              isOwner={isOwner}
              roomOwner={roomOwner}
              peerStates={peerStates}
              localStreamReady={localStreamReady}
              videoEnabled={videoEnabled}
              hasVideo={hasVideo}
              audioEnabled={audioEnabled}
              audioLevel={audioLevel}
              sendMutePeer={sendMutePeer}
              sendKickPeer={sendKickPeer}
            />
            <Controls
              videoEnabled={videoEnabled}
              audioEnabled={audioEnabled}
              hasVideo={hasVideo}
              hasAudio={hasAudio}
              toggleVideo={toggleVideo}
              toggleAudio={toggleAudio}
              leaveRoom={leaveRoom}
            />
          </>
        )}
      </div>
    </div>
  );
}