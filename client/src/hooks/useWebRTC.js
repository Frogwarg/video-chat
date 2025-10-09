import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

export default function useWebRTC({
  serverIp,
  roomId,
  userName,
  currentRoom,
  setCurrentRoom,
  setIsInCall,
  setErrorMessage,
  localVideoRef,
  localStreamRef,
  peerConnectionsRef,
  isInCall
}) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [peers, setPeers] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [roomOwner, setRoomOwner] = useState('');
  const [peerStates, setPeerStates] = useState({});
  const [peerNames, setPeerNames] = useState({});
  const [myUserName, setMyUserName] = useState('');

  const socket = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const myPeerId = useRef(`peer-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    socket.current = io(`${window.location.protocol}//${serverIp}`, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });

    socket.current.on('connect', () => {
      setConnectionStatus('🔗 Подключено к серверу');
    });

    socket.current.on('connect_error', (err) => {
      setErrorMessage(`⚠️ Не удалось подключиться к серверу: ${err.message}. Проверьте IP и порт.`);
    });

    socket.current.on('room-info', ({ owner, existingPeers }) => {
      setRoomOwner(owner);
      setIsOwner(myPeerId.current === owner);
      
      existingPeers.forEach(({ peerId, userName }) => {
        setPeerNames(prev => ({ ...prev, [peerId]: userName }));
        handleSignal({ type: 'peer-joined', fromPeerId: peerId });
      });
    });

    socket.current.on('peer-joined', ({ peerId, userName }) => {
      setPeerNames(prev => ({ ...prev, [peerId]: userName }));
      setPeerStates(prev => ({
        ...prev,
        [peerId]: { audioEnabled: true, videoEnabled: true }
      }));
      handleSignal({ type: 'peer-joined', fromPeerId: peerId });
    });

    socket.current.on('offer', ({ offer, fromPeerId }) => {
      handleSignal({ type: 'offer', fromPeerId, offer });
    });

    socket.current.on('answer', ({ answer, fromPeerId }) => {
      handleSignal({ type: 'answer', fromPeerId, answer });
    });

    socket.current.on('ice-candidate', ({ candidate, fromPeerId }) => {
      handleSignal({ type: 'ice-candidate', fromPeerId, candidate });
    });

    socket.current.on('peer-left', (peerId) => {
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
          track.enabled = !mute;
          if (type === 'audio') setAudioEnabled(!mute);
          if (type === 'video') setVideoEnabled(!mute);
          Object.values(peerConnectionsRef.current).forEach(pc => {
            pc.getSenders().forEach(sender => {
              if (sender.track?.kind === type) {
                sender.track.enabled = !mute;
              }
            });
          });
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
      setRoomOwner(newOwnerId);
      setIsOwner(myPeerId.current === newOwnerId);
    });

    checkDevices();

    return () => {
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

  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current && isInCall) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play()
        .then(() => setLocalStreamReady(true))
        .catch(e => console.error('Local video play error:', e));
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

    // Запрашиваем разрешения, чтобы получить доступ к меткам устройств
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop()); // Останавливаем треки, чтобы не держать устройства занятыми
    } catch (err) {
      console.warn('Failed to get user media for device enumeration:', err);
      // Продолжаем, даже если разрешения не получены
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    const hasVideoInput = devices.some(device => device.kind === 'videoinput');
    const hasAudioInput = devices.some(device => device.kind === 'audioinput');

    setHasVideo(hasVideoInput);
    setHasAudio(hasAudioInput);

    if (!hasVideoInput && !hasAudioInput) {
      setErrorMessage('⚠️ Камера и микрофон не найдены. Вы можете подключиться без медиа.');
    } else if (!hasVideoInput) {
      setErrorMessage('⚠️ Камера не найдена. Подключение возможно с аудио или без медиа.');
    } else if (!hasAudioInput) {
      setErrorMessage('⚠️ Микрофон не найден. Подключение возможно с видео или без медиа.');
    } else {
      setErrorMessage(''); // Очищаем сообщение об ошибке, если устройства найдены
    }
  } catch (err) {
    console.error('Error in checkDevices:', err);
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
      
      setVideoEnabled(videoTracks.length > 0 && videoTracks[0].enabled);
      setAudioEnabled(audioTracks.length > 0 && audioTracks[0].enabled);
      
      if (audioTracks.length > 0) {
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
      }

      setConnectionStatus(
        videoTracks.length === 0 && audioTracks.length === 0 ? '✅ Подключено без видео и аудио' :
        videoTracks.length === 0 ? '✅ Подключено (только аудио)' :
        audioTracks.length === 0 ? '✅ Подключено (только видео)' :
        '✅ Камера и микрофон подключены'
      );

      return stream;
    } catch (err) {
      const userMessage = err.name === 'NotAllowedError' ? '❌ Доступ запрещён.' :
                         err.name === 'NotFoundError' ? '❌ Устройства не найдены.' :
                         err.name === 'NotReadableError' ? '❌ Устройство занято.' : `❌ Ошибка: ${err.message}`;
      setConnectionStatus(userMessage);
      setErrorMessage(userMessage);
      return null;
    }
  };

  const createPeerConnection = (peerId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          pc.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
      oscillator.start();
      const dummyTrack = dst.stream.getAudioTracks()[0];
      dummyTrack.enabled = false;
      pc.addTrack(dummyTrack, dst.stream);
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        // if (!remoteVideosRef.current[peerId]) {
        //   remoteVideosRef.current[peerId] = document.createElement('video');
        // }
        // const video = remoteVideosRef.current[peerId];
        // if (!video.srcObject) {
        //   video.srcObject = remoteStream;
        //   video.autoplay = true;
        //   video.playsInline = true;
        //   video.play().catch(() => {});
        // }
        setPeers(prev => ({ ...prev, [peerId]: remoteStream }));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current.emit('ice-candidate', { candidate: event.candidate, to: peerId, roomId: currentRoom });
      }
    };

    pc.peerId = peerId;
    return pc;
  };

  const handleSignal = async ({ type, fromPeerId, offer, answer, candidate }) => {
    if (type === 'peer-joined') {
      if (peerConnectionsRef.current[fromPeerId]) return;
      if (myPeerId.current < fromPeerId) {
        const pc = createPeerConnection(fromPeerId);
        peerConnectionsRef.current[fromPeerId] = pc;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.current.emit('offer', { offer, to: fromPeerId, roomId: currentRoom });
      }
    } else if (type === 'offer') {
      let pc = peerConnectionsRef.current[fromPeerId];
      if (!pc) {
        pc = createPeerConnection(fromPeerId);
        peerConnectionsRef.current[fromPeerId] = pc;
      }
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.current.emit('answer', { answer, to: fromPeerId, roomId: currentRoom });
    } else if (type === 'answer') {
      const pc = peerConnectionsRef.current[fromPeerId];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } else if (type === 'ice-candidate') {
      const pc = peerConnectionsRef.current[fromPeerId];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } else if (type === 'peer-left') {
      if (peerConnectionsRef.current[fromPeerId]) {
        peerConnectionsRef.current[fromPeerId].close();
        delete peerConnectionsRef.current[fromPeerId];
      }
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[fromPeerId];
        return newPeers;
      });
      setPeerStates(prev => {
        const newStates = { ...prev };
        delete newStates[fromPeerId];
        return newStates;
      });
      setPeerNames(prev => {
        const newNames = { ...prev };
        delete newNames[fromPeerId];
        return newNames;
      });
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !serverIp.trim()) {
      setErrorMessage('⚠️ Введите IP сервера и ID комнаты');
      return;
    }

    const finalUserName = userName.trim() || 'Гость';
    setMyUserName(finalUserName);

    const stream = await startLocalStream();

    localStreamRef.current = stream;
    setCurrentRoom(roomId);
    setIsInCall(true);
    socket.current.emit('join-room', roomId, myPeerId.current, finalUserName);
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
    setPeerNames({});
    setMyUserName('');
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        Object.values(peerConnectionsRef.current).forEach(pc => {
          pc.getSenders().forEach(sender => {
            if (sender.track?.kind === 'video') {
              sender.track.enabled = videoTrack.enabled;
            }
          });
        });
        socket.current.emit('mute-update', {
        peerId: myPeerId.current,
        type: 'video',
        mute: !videoTrack.enabled,
        roomId: currentRoom
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
        Object.values(peerConnectionsRef.current).forEach(pc => {
          pc.getSenders().forEach(sender => {
            if (sender.track?.kind === 'audio') {
              sender.track.enabled = audioTrack.enabled;
            }
          });
        });
        socket.current.emit('mute-update', {
        peerId: myPeerId.current,
        type: 'audio',
        mute: !audioTrack.enabled,
        roomId: currentRoom
      });
      } else {
        setAudioEnabled(false);
        socket.current.emit('mute-update', {
        peerId: myPeerId.current,
        type: 'audio',
        mute: true,
        roomId: currentRoom
      });
      }
    } else {
      setAudioEnabled(false);
      socket.current.emit('mute-update', {
        peerId: myPeerId.current,
        type: 'audio',
        mute: true,
        roomId: currentRoom
      });
    }
  };

  const sendMutePeer = (targetPeerId, type) => {
    if (isOwner) {
      const key = type === 'audio' ? 'audioEnabled' : 'videoEnabled';
      const currentState = peerStates?.[targetPeerId]?.[key] || false;
      const mute = currentState;
      socket.current.emit('mute-peer', { targetPeerId, type, mute });
    }
  };

  const sendKickPeer = (targetPeerId) => {
    if (isOwner) {
      socket.current.emit('kick-peer', { targetPeerId });
    }
  };

  return {
    videoEnabled,
    setVideoEnabled,
    audioEnabled,
    setAudioEnabled,
    peers,
    setPeers,
    connectionStatus,
    hasVideo,
    hasAudio,
    localStreamReady,
    audioLevel,
    isOwner,
    roomOwner,
    peerStates,
    peerNames,
    myUserName,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    sendMutePeer,
    sendKickPeer,
  };
}