import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Copy, Check, Users, AlertCircle, Crown } from 'lucide-react';
import styles from './App.module.css';

export default function VideoChat() {
  const [roomId, setRoomId] = useState('');
  const [serverIp, setServerIp] = useState('192.168.0.108:3000');
  const [currentRoom, setCurrentRoom] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [peers, setPeers] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [roomOwner, setRoomOwner] = useState('');
  const [peerStates, setPeerStates] = useState({});
  
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const socket = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  const myPeerId = useRef(`peer-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (!socket.current) {
      socket.current = io(`https://${serverIp}`, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      });
    }

    socket.current.on('connect', () => {
      console.log('Socket connected:', socket.current.id);
      setConnectionStatus('🔗 Подключено к серверу');
    });

    socket.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setErrorMessage(`⚠️ Не удалось подключиться к серверу: ${err.message}. Проверьте IP и порт.`);
    });

    socket.current.on('room-info', ({ owner, existingPeers }) => {
      console.log('Room info: owner', owner, 'existing peers:', existingPeers);
      setRoomOwner(owner);
      setIsOwner(myPeerId.current === owner);
      existingPeers.forEach(peerId => {
        handleSignal({ type: 'peer-joined', fromPeerId: peerId });
      });
    });

    socket.current.on('peer-joined', (peerId) => {
      console.log('New peer joined:', peerId);
      setPeerStates(prev => ({
        ...prev,
        [peerId]: { audioEnabled: true, videoEnabled: true } // Начальные состояния
      }));
      handleSignal({ type: 'peer-joined', fromPeerId: peerId });
    });

    socket.current.on('offer', ({ offer, fromPeerId }) => {
      console.log('Received offer from:', fromPeerId);
      handleSignal({ type: 'offer', fromPeerId, offer });
    });

    socket.current.on('answer', ({ answer, fromPeerId }) => {
      console.log('Received answer from:', fromPeerId);
      handleSignal({ type: 'answer', fromPeerId, answer });
    });

    socket.current.on('ice-candidate', ({ candidate, fromPeerId }) => {
      console.log('Received ICE candidate from:', fromPeerId);
      handleSignal({ type: 'ice-candidate', fromPeerId, candidate });
    });

    socket.current.on('peer-left', (peerId) => {
      console.log('Peer left:', peerId);
      handleSignal({ type: 'peer-left', fromPeerId: peerId });
    });

    socket.current.on('error', ({ message }) => {
      setErrorMessage(`⚠️ Ошибка сервера: ${message}`);
    });

    socket.current.on('mute-command', ({ type, mute }) => {
      if (localStreamRef.current) {
        const track = type === 'audio' 
          ? localStreamRef.current.getAudioTracks()[0] 
          : localStreamRef.current.getVideoTracks()[0];
        if (track) {
          track.enabled = !mute; // mute=true -> enabled=false
          if (type === 'audio') setAudioEnabled(!mute);
          if (type === 'video') setVideoEnabled(!mute);
          console.log(`Forced ${type} mute: ${mute}`);
          // Update senders for all peers
          Object.values(peerConnectionsRef.current).forEach(pc => {
            pc.getSenders().forEach(sender => {
              if (sender.track?.kind === type) {
                sender.track.enabled = !mute;
              }
            });
          });
          // Обновляем peerStates для собственного ID
          setPeerStates(prev => ({
            ...prev,
            [myPeerId.current]: {
              ...prev[myPeerId.current],
              [type === 'audio' ? 'audioEnabled' : 'videoEnabled']: !mute
            }
          }));
        }
      }
    });

    socket.current.on('mute-update', ({ peerId, type, mute }) => {
      console.log(`Received mute-update for ${peerId}: ${type} = ${mute}`);
      setPeerStates(prev => ({
        ...prev,
        [peerId]: {
          ...prev[peerId],
          [type === 'audio' ? 'audioEnabled' : 'videoEnabled']: !mute
        }
      }));
    });

    socket.current.on('kicked', () => {
      setErrorMessage('⚠️ Вы были удалены владельцем комнаты');
      leaveRoom();
    });

    socket.current.on('new-owner', (newOwnerId) => {
      console.log(`New owner assigned: ${newOwnerId}`);
      setRoomOwner(newOwnerId);
      setIsOwner(myPeerId.current === newOwnerId);
    });

    checkDevices();

    return () => {
      // Cleanup listeners
      socket.current.off('room-info');
      socket.current.off('peer-joined');
      socket.current.off('offer');
      socket.current.off('answer');
      socket.current.off('ice-candidate');
      socket.current.off('peer-left');
      socket.current.off('error');
      socket.current.off('mute-command');
      socket.current.off('kicked');
      socket.current.off('connect');
      socket.current.off('connect_error');
      socket.current.off('new-owner');
      socket.current.off('mute-update');
    };
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIp]);

  // Отдельный эффект для управления локальным видео
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current && isInCall) {
      console.log('Setting up local video in useEffect');
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play()
        .then(() => {
          console.log('Local video playing from useEffect');
          setLocalStreamReady(true);
        })
        .catch(e => console.error('Local video play error in useEffect:', e));
    }
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInCall, localStreamRef.current]);

  const checkDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setErrorMessage('⚠️ API медиаустройств недоступен. Используйте HTTPS или localhost.');
        setHasVideo(false);
        setHasAudio(false);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      setHasVideo(videoDevices.length > 0);
      setHasAudio(audioDevices.length > 0);
      
      if (videoDevices.length === 0 && audioDevices.length === 0) {
        setErrorMessage('⚠️ Камера и микрофон не найдены. Вы можете подключиться без медиа.');
      } else if (videoDevices.length === 0) {
        setErrorMessage('⚠️ Камера не найдена. Подключение возможно с аудио или без медиа.');
      } else if (audioDevices.length === 0) {
        setErrorMessage('⚠️ Микрофон не найден. Подключение возможно с видео или без медиа.');
      }
    } catch (err) {
      console.error('Ошибка проверки устройств:', err);
      setErrorMessage('⚠️ Не удалось проверить устройства: ' + err.message);
      setHasVideo(false);
      setHasAudio(false);
    }
  };

  const startLocalStream = async () => {
    try {
      if (!hasVideo && !hasAudio) {
        setConnectionStatus('✅ Подключено без камеры и микрофона');
        return null;
      }

      const constraints = {
        video: hasVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: hasAudio ? { echoCancellation: true, noiseSuppression: true } : false
      };

      setConnectionStatus('🔹 Запрашиваем доступ...');
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      localStreamRef.current = stream;
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      // Диагностика локальных треков
      console.log('Local stream video tracks:', videoTracks.length);
      console.log('Local stream audio tracks:', audioTracks.length);
      videoTracks.forEach((track, i) => {
        console.log(`Local video track ${i}:`, track.label, 'enabled:', track.enabled, 'readyState:', track.readyState);
      });
      audioTracks.forEach((track, i) => {
        console.log(`Local audio track ${i}:`, track.label, 'enabled:', track.enabled, 'readyState:', track.readyState, 'muted:', track.muted);
      });
      
      // Устанавливаем состояния сразу после получения стрима
      const hasVideoTrack = videoTracks.length > 0 && videoTracks[0].enabled;
      const hasAudioTrack = audioTracks.length > 0 && audioTracks[0].enabled;
      
      setVideoEnabled(hasVideoTrack);
      setAudioEnabled(hasAudioTrack);
      
      // Устанавливаем srcObject и запускаем видео
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('Local video srcObject set:', !!localVideoRef.current.srcObject);
        
        // Используем Promise для гарантированного воспроизведения
        const playVideo = async () => {
          try {
            await localVideoRef.current.play();
            console.log('Local video playing successfully');
            setLocalStreamReady(true);
          } catch (e) {
            console.error('Local video play error:', e);
            // Повторная попытка
            setTimeout(async () => {
              if (localVideoRef.current && localVideoRef.current.srcObject) {
                try {
                  await localVideoRef.current.play();
                  console.log('Local video playing on retry');
                  setLocalStreamReady(true);
                } catch (err) {
                  console.error('Local video retry error:', err);
                }
              }
            }, 500);
          }
        };
        
        playVideo();
      }

      // Настройка анализатора аудио для визуализации
      if (audioTracks.length > 0) {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          audioContextRef.current = audioContext;
          const analyser = audioContext.createAnalyser();
          analyserRef.current = analyser;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);
          analyser.fftSize = 256;
          
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          const checkAudioLevel = () => {
            if (analyserRef.current && audioEnabled) {
              analyserRef.current.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b) / bufferLength;
              setAudioLevel(Math.min(100, (average / 255) * 100 * 3));
              requestAnimationFrame(checkAudioLevel);
            }
          };
          checkAudioLevel();
          
          console.log('Audio analyser setup complete');
        } catch (e) {
          console.error('Failed to setup audio analyser:', e);
        }
      }

      if (videoTracks.length === 0 && audioTracks.length === 0) {
        setConnectionStatus('✅ Подключено без видео и аудио');
      } else if (videoTracks.length === 0) {
        setConnectionStatus('✅ Подключено (только аудио)');
      } else if (audioTracks.length === 0) {
        setConnectionStatus('✅ Подключено (только видео)');
      } else {
        setConnectionStatus('✅ Камера и микрофон подключены');
      }

      console.log('Local stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
      return stream;
    } catch (err) {
      console.error('Ошибка доступа:', err);
      let userMessage = err.name === 'NotAllowedError' ? '❌ Доступ запрещён.' :
                        err.name === 'NotFoundError' ? '❌ Устройства не найдены.' :
                        err.name === 'NotReadableError' ? '❌ Устройство занято.' : `❌ Ошибка: ${err.message}`;
      setConnectionStatus(userMessage);
      setErrorMessage(userMessage);
      return null;
    }
  };

  const createPeerConnection = (peerId) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
    };

    const pc = new RTCPeerConnection(config);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        // Убеждаемся что трек активен
        if (track.readyState === 'live') {
          const sender = pc.addTrack(track, localStreamRef.current);
          console.log('Added track to peer connection:', track.kind, 'label:', track.label, 'enabled:', track.enabled, 'readyState:', track.readyState, 'for peer:', peerId);
        } else {
          console.warn('Track not live:', track.kind, 'readyState:', track.readyState);
        }
      });
    } else {
      // Dummy audio track for no-media devices
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
      oscillator.start();
      const dummyTrack = dst.stream.getAudioTracks()[0];
      dummyTrack.enabled = false;
      pc.addTrack(dummyTrack, dst.stream);
      console.log('Added dummy audio track for peer:', peerId);
    }

    pc.ontrack = (event) => {
      console.log('ontrack event for peer:', peerId, 'streams:', event.streams, 'tracks:', event.streams[0]?.getTracks().map(t => `${t.kind}: ${t.enabled}`));
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];

        // Диагностика треков
        const audioTracks = remoteStream.getAudioTracks();
        const videoTracks = remoteStream.getVideoTracks();
        console.log(`Remote stream for ${peerId} - Audio tracks:`, audioTracks.length, 'Video tracks:', videoTracks.length);
        audioTracks.forEach((track, i) => {
          console.log(`Audio track ${i}:`, track.label, 'enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState);
        });

        if (!remoteVideosRef.current[peerId]) {
          remoteVideosRef.current[peerId] = document.createElement('video');
        }
        const video = remoteVideosRef.current[peerId];
        if (!video.srcObject) {
          video.srcObject = remoteStream;
          video.autoplay = true;
          video.playsInline = true;
          video.play().catch(e => console.error('Remote video play error for peer', peerId, ':', e));

          // Дополнительная проверка воспроизведения аудио
          video.onloadedmetadata = () => {
            console.log(`Remote video metadata loaded for ${peerId}, has audio: ${audioTracks.length > 0}`);
          }
        }
        setPeers(prev => ({ ...prev, [peerId]: remoteStream }));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to peer:', peerId, event.candidate);
        socket.current.emit('ice-candidate', { candidate: event.candidate, to: peerId, roomId: currentRoom });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('Peer connection state for peer', peerId, ':', state);
      if (state === 'connected') {
        console.log('Senders for peer', peerId, ':', pc.getSenders().map(s => `${s.track?.kind}: ${s.track?.enabled}`));
        setConnectionStatus('🟢 Соединение установлено');
      } else if (state === 'connecting') {
        setConnectionStatus('🟡 Соединение...');
      } else if (state === 'disconnected' || state === 'failed') {
        setConnectionStatus('🔴 Соединение потеряно');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state for peer', peerId, ':', pc.iceConnectionState);
    };

    pc.peerId = peerId;
    return pc;
  };

  const handleSignal = async (signal) => {
    const { type, fromPeerId, offer, answer, candidate } = signal;
    console.log('Received signal:', type, 'from peer:', fromPeerId);

    if (type === 'peer-joined') {
      if (peerConnectionsRef.current[fromPeerId]) {
        console.log('Already connected to peer:', fromPeerId);
        return;
      }
      // Decide initiator based on ID comparison (prevents glare)
      if (myPeerId.current < fromPeerId) {
        console.log('Initiating offer to peer:', fromPeerId);
        const pc = createPeerConnection(fromPeerId);
        peerConnectionsRef.current[fromPeerId] = pc;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log('Sending offer to peer:', fromPeerId);
          socket.current.emit('offer', { offer, to: fromPeerId, roomId: currentRoom });
        } catch (e) {
          console.error('Error creating offer for peer', fromPeerId, ':', e);
        }
      } else {
        console.log('Waiting for offer from peer:', fromPeerId);
        // No PC yet; create when offer arrives
      }
    } else if (type === 'offer') {
      let pc = peerConnectionsRef.current[fromPeerId];
      if (!pc) {
        console.log('Creating PC for received offer from:', fromPeerId);
        pc = createPeerConnection(fromPeerId);
        peerConnectionsRef.current[fromPeerId] = pc;
      }
      try {
        if (pc.signalingState !== 'stable') {
          console.warn('Signaling not stable for offer; ignoring to avoid conflict');
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('Sending answer to peer:', fromPeerId);
        socket.current.emit('answer', { answer, to: fromPeerId, roomId: currentRoom });
      } catch (e) {
        console.error('Error handling offer for peer', fromPeerId, ':', e);
      }
    } else if (type === 'answer') {
      const pc = peerConnectionsRef.current[fromPeerId];
      if (pc) {
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('✅ Answer applied for peer:', fromPeerId);
          } else {
            console.warn('⚠️ Ignored answer from', fromPeerId, 'because state is', pc.signalingState);
          }
        } catch (e) {
          console.error('Error setting answer for peer', fromPeerId, ':', e);
        }
      } else {
        console.error('No peer connection found for peer:', fromPeerId);
      }
    } else if (type === 'ice-candidate') {
      const pc = peerConnectionsRef.current[fromPeerId];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('ICE candidate added for peer:', fromPeerId);
        } catch (e) {
          console.error('Error adding ICE candidate for peer', fromPeerId, ':', e);
        }
      } else {
        console.error('No peer connection found for ICE candidate from peer:', fromPeerId);
      }
    } else if (type === 'peer-left') {
        console.log(`Cleaning up peer ${fromPeerId} from UI and connections`);
        if (peerConnectionsRef.current[fromPeerId]) {
          peerConnectionsRef.current[fromPeerId].close();
          delete peerConnectionsRef.current[fromPeerId];
          console.log(`Closed peer connection for ${fromPeerId}`);
        }
        if (remoteVideosRef.current[fromPeerId]) {
          const video = remoteVideosRef.current[fromPeerId];
          video.srcObject = null; // Очищаем srcObject
          delete remoteVideosRef.current[fromPeerId];
          console.log(`Removed video element for ${fromPeerId}`);
        }
        setPeers(prev => {
          const newPeers = { ...prev };
          delete newPeers[fromPeerId];
          console.log(`Removed peer ${fromPeerId} from peers state`);
          return newPeers;
        });
        setPeerStates(prev => {
          const newStates = { ...prev };
          delete newStates[fromPeerId];
          console.log(`Removed peer ${fromPeerId} from peerStates`);
          return newStates;
        });
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !serverIp.trim()) {
      setErrorMessage('⚠️ Введите IP сервера и ID комнаты');
      return;
    }

    const stream = await startLocalStream();
    if (stream === null && !hasVideo && !hasAudio) {
      console.log('Joining without media');
    }

    setCurrentRoom(roomId);
    setIsInCall(true);
    socket.current.emit('join-room', roomId, myPeerId.current);
  };

  const leaveRoom = () => {
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    socket.current.emit('leave-room', currentRoom, myPeerId.current);
    setPeers({});
    setIsInCall(false);
    setCurrentRoom('');
    setConnectionStatus('');
    setVideoEnabled(false);
    setAudioEnabled(false);
    setLocalStreamReady(false);
    setAudioLevel(0);
    setIsOwner(false);
    setRoomOwner('');
    remoteVideosRef.current = {};
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        console.log('Video track toggled:', videoTrack.enabled, 'for stream:', localStreamRef.current.id);
        Object.values(peerConnectionsRef.current).forEach(pc => {
          pc.getSenders().forEach(sender => {
            if (sender.track?.kind === 'video') {
              sender.track.enabled = videoTrack.enabled;
              console.log('Updated sender video track for peer:', pc.peerId, 'enabled:', sender.track.enabled);
            }
          });
        });
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        console.log('Audio track toggled:', audioTrack.enabled, 'for stream:', localStreamRef.current.id);
        Object.values(peerConnectionsRef.current).forEach(pc => {
          pc.getSenders().forEach(sender => {
            if (sender.track?.kind === 'audio') {
              sender.track.enabled = audioTrack.enabled;
              console.log('Updated sender audio track for peer:', pc.peerId, 'enabled:', sender.track.enabled);
            }
          });
        });
      } else {
        console.log('No audio track available to toggle');
        setAudioEnabled(false);
      }
    } else {
      console.log('No local stream for audio toggle');
      setAudioEnabled(false);
    }
  };

  const sendMutePeer = (targetPeerId, type) => {
    if (isOwner) {
      const key = type === 'audio' ? 'audioEnabled' : (type === 'video' ? 'videoEnabled' : null);
      const currentState = key ? Boolean(peerStates?.[targetPeerId]?.[key]) : false;
      const mute = currentState; // Переключаем текущее состояние
      console.log(`Current ${type} state for ${targetPeerId}:`, currentState, '-> Sending mute command:', mute);
      socket.current.emit('mute-peer', { targetPeerId, type, mute });
      console.log(`Toggling ${type} for ${targetPeerId}: mute=${mute}`);
    }
  };

  const sendKickPeer = (targetPeerId) => {
    if (isOwner) {
      socket.current.emit('kick-peer', { targetPeerId });
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        <div className={styles.header}>
          <h1 className={styles.title}>VideoConnect</h1>
          <p className={styles.subtitle}>Локальная видеосвязь в сети LAN</p>
        </div>

        {!isInCall ? (
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
        ) : (
          <div>
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

            <div className={styles.videoGrid}>
              <div className={styles.videoBox}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={styles.videoMirror}
                  style={{ display: (localStreamReady && localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0 && videoEnabled) ? 'block' : 'none' }}
                  onError={e => console.error('Local video error:', e)}
                  onLoadedMetadata={() => console.log('Local video metadata loaded')}
                  onCanPlay={() => console.log('Local video can play')}
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
                      onError={e => console.error(`Video error for peer ${peerId}:`, e)}
                    />
                  ) : (
                    <div className={styles.videoOffOverlay}>
                      <VideoOff style={{ width: '4rem', height: '4rem', color: '#9ca3af' }} />
                      <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                        Участник без видео
                      </span>
                    </div>
                  )}
                  {isOwner && peerId !== myPeerId.current && (
                    <div className={styles.ownerControls}>
                      <button onClick={() => sendMutePeer(peerId, 'audio')} title={peerStates[peerId]?.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}>
                        {peerStates[peerId]?.audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                      </button>
                      <button onClick={() => sendMutePeer(peerId, 'video')} title={peerStates[peerId]?.videoEnabled ? 'Выключить видео' : 'Включить видео'}>
                        {peerStates[peerId]?.videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                      </button>
                      <button onClick={() => sendKickPeer(peerId)} title="Исключить">
                        <PhoneOff size={16} />
                      </button>
                    </div>
                  )}
                  <div className={styles.videoLabel}>Участник {index + 1} {peerId === roomOwner ? <Crown style={{ width: '1rem', height: '1rem', color: '#fbbf24' }} /> : ''}</div>
                </div>
              ))}
            </div>

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
          </div>
        )}
      </div>
    </div>
  );
}