import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { useChat } from "./chat-context";

interface PeerConnection {
  pc: RTCPeerConnection;
  nickname: string;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function useVoiceChat() {
  const { socket, nickname, isMuted } = useChat();
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPeerConnection = useCallback((targetNickname: string): RTCPeerConnection => {
    // Close existing connection if any
    const existing = peerConnectionsRef.current.get(targetNickname);
    if (existing) {
      existing.pc.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc_ice_candidate", {
          targetNickname,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0] && Platform.OS === "web") {
        // Create or reuse audio element for this peer
        let audio = audioElementsRef.current.get(targetNickname);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(targetNickname, audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch((err) => {
          console.warn("[Voice] Audio play failed:", err);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] ${targetNickname}: ${state}`);
      if (state === "failed" || state === "closed" || state === "disconnected") {
        peerConnectionsRef.current.delete(targetNickname);
        // Clean up audio element
        const audio = audioElementsRef.current.get(targetNickname);
        if (audio) {
          audio.srcObject = null;
          audioElementsRef.current.delete(targetNickname);
        }
      }
    };

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionsRef.current.set(targetNickname, { pc, nickname: targetNickname });
    return pc;
  }, [socket]);

  const startVoice = useCallback(async () => {
    if (Platform.OS === "web") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        localStreamRef.current = stream;

        // Apply current mute state
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
        });

        setIsVoiceEnabled(true);
        setError(null);

        // Request list of current peers to connect with
        socket?.emit("request_peers");
      } catch (err: any) {
        console.error("[Voice] Mic access failed:", err);
        if (err.name === "NotAllowedError") {
          setError("Microphone permission denied. Please allow mic access.");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found on this device.");
        } else {
          setError("Could not access microphone.");
        }
      }
    } else {
      // Native: use expo-audio for recording
      try {
        const expoAudio = await import("expo-audio");
        await expoAudio.requestRecordingPermissionsAsync();
        await expoAudio.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        setIsVoiceEnabled(true);
        setError(null);
        socket?.emit("request_peers");
      } catch (err) {
        console.error("[Voice] Native audio setup failed:", err);
        setError("Could not access microphone.");
      }
    }
  }, [socket, isMuted]);

  const stopVoice = useCallback(() => {
    // Stop all local tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close all peer connections
    peerConnectionsRef.current.forEach(({ pc }) => pc.close());
    peerConnectionsRef.current.clear();

    // Clean up audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();

    setIsVoiceEnabled(false);
  }, []);

  // Sync mute state with local stream
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Handle WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    const handlePeersList = async ({ peers }: { peers: string[] }) => {
      for (const peerNickname of peers) {
        if (peerNickname === nickname) continue;
        const pc = createPeerConnection(peerNickname);
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
          });
          await pc.setLocalDescription(offer);
          socket.emit("webrtc_offer", { targetNickname: peerNickname, offer });
        } catch (err) {
          console.error("[WebRTC] Offer failed:", err);
        }
      }
    };

    const handleOffer = async ({ fromNickname, offer }: { fromNickname: string; offer: RTCSessionDescriptionInit }) => {
      const pc = createPeerConnection(fromNickname);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc_answer", { targetNickname: fromNickname, answer });
      } catch (err) {
        console.error("[WebRTC] Answer failed:", err);
      }
    };

    const handleAnswer = async ({ fromNickname, answer }: { fromNickname: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peerConnectionsRef.current.get(fromNickname);
      if (peer) {
        try {
          if (peer.pc.signalingState !== "stable") {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (err) {
          console.error("[WebRTC] Set answer failed:", err);
        }
      }
    };

    const handleIceCandidate = async ({ fromNickname, candidate }: { fromNickname: string; candidate: RTCIceCandidateInit }) => {
      const peer = peerConnectionsRef.current.get(fromNickname);
      if (peer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("[WebRTC] ICE candidate failed:", err);
        }
      }
    };

    const handlePeerDisconnected = ({ nickname: peerNickname }: { nickname: string }) => {
      const peer = peerConnectionsRef.current.get(peerNickname);
      if (peer) {
        peer.pc.close();
        peerConnectionsRef.current.delete(peerNickname);
      }
      const audio = audioElementsRef.current.get(peerNickname);
      if (audio) {
        audio.srcObject = null;
        audioElementsRef.current.delete(peerNickname);
      }
    };

    socket.on("peers_list", handlePeersList);
    socket.on("webrtc_offer", handleOffer);
    socket.on("webrtc_answer", handleAnswer);
    socket.on("webrtc_ice_candidate", handleIceCandidate);
    socket.on("peer_disconnected", handlePeerDisconnected);

    return () => {
      socket.off("peers_list", handlePeersList);
      socket.off("webrtc_offer", handleOffer);
      socket.off("webrtc_answer", handleAnswer);
      socket.off("webrtc_ice_candidate", handleIceCandidate);
      socket.off("peer_disconnected", handlePeerDisconnected);
    };
  }, [socket, nickname, createPeerConnection]);

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  return {
    isVoiceEnabled,
    error,
    startVoice,
    stopVoice,
  };
}
