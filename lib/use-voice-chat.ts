import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { useChat } from "./chat-context";

// Dynamically import react-native-webrtc on native, use browser WebRTC on web
let RTCPeerConnectionNative: any = null;
let RTCSessionDescriptionNative: any = null;
let RTCIceCandidateNative: any = null;
let mediaDevicesNative: any = null;

if (Platform.OS !== "web") {
  try {
    const webrtc = require("react-native-webrtc");
    RTCPeerConnectionNative = webrtc.RTCPeerConnection;
    RTCSessionDescriptionNative = webrtc.RTCSessionDescription;
    RTCIceCandidateNative = webrtc.RTCIceCandidate;
    mediaDevicesNative = webrtc.mediaDevices;
  } catch (e) {
    console.warn("[Voice] react-native-webrtc not available:", e);
  }
}

const getRTCPeerConnection = () =>
  Platform.OS === "web" ? RTCPeerConnection : RTCPeerConnectionNative;
const getRTCSessionDescription = () =>
  Platform.OS === "web" ? RTCSessionDescription : RTCSessionDescriptionNative;
const getRTCIceCandidate = () =>
  Platform.OS === "web" ? RTCIceCandidate : RTCIceCandidateNative;
const getMediaDevices = () =>
  Platform.OS === "web" ? navigator.mediaDevices : mediaDevicesNative;

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export function useVoiceChat() {
  const { socket, nickname, isMuted } = useChat();
  const localStreamRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const audioElementsRef = useRef<Map<string, any>>(new Map());
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPeerConnection = useCallback((targetNickname: string): any => {
    const existing = peerConnectionsRef.current.get(targetNickname);
    if (existing) {
      try { existing.close(); } catch {}
    }

    const PeerConnection = getRTCPeerConnection();
    if (!PeerConnection) {
      console.warn("[Voice] RTCPeerConnection not available");
      return null;
    }

    const pc = new PeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event: any) => {
      if (event.candidate && socket) {
        socket.emit("webrtc_ice_candidate", {
          targetNickname,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event: any) => {
      const stream = event.streams?.[0] || event.stream;
      if (!stream) return;

      if (Platform.OS === "web") {
        // Web: use HTML Audio element
        let audio = audioElementsRef.current.get(targetNickname);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(targetNickname, audio);
        }
        audio.srcObject = stream;
        audio.play().catch((err: any) => {
          console.warn("[Voice] Audio play failed:", err);
        });
      } else {
        // Native: react-native-webrtc handles audio output automatically
        // when tracks are added to the peer connection
        console.log("[Voice] Remote stream received from:", targetNickname);
      }
    };

    // react-native-webrtc uses onaddstream instead of ontrack in some versions
    pc.onaddstream = (event: any) => {
      if (Platform.OS !== "web" && event.stream) {
        console.log("[Voice] Remote stream added from:", targetNickname);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] ${targetNickname}: ${state}`);
      if (state === "failed" || state === "closed" || state === "disconnected") {
        peerConnectionsRef.current.delete(targetNickname);
        if (Platform.OS === "web") {
          const audio = audioElementsRef.current.get(targetNickname);
          if (audio) {
            audio.srcObject = null;
            audioElementsRef.current.delete(targetNickname);
          }
        }
      }
    };

    // Add local stream tracks
    if (localStreamRef.current) {
      if (pc.addStream) {
        // react-native-webrtc older API
        pc.addStream(localStreamRef.current);
      } else {
        localStreamRef.current.getTracks().forEach((track: any) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }
    }

    peerConnectionsRef.current.set(targetNickname, pc);
    return pc;
  }, [socket]);

  const startVoice = useCallback(async () => {
    try {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices) {
        setError("Voice chat is not supported on this device.");
        return;
      }

      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      // Apply current mute state to tracks
      if (stream.getAudioTracks) {
        stream.getAudioTracks().forEach((track: any) => {
          track.enabled = !isMuted;
        });
      }

      setIsVoiceEnabled(true);
      setError(null);

      // Request list of current peers to connect with
      socket?.emit("request_peers");
    } catch (err: any) {
      console.error("[Voice] Mic access failed:", err);
      if (err.name === "NotAllowedError" || err.message?.includes("denied")) {
        setError("Microphone permission denied. Please allow mic access.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found on this device.");
      } else {
        setError("Could not access microphone: " + (err.message || "Unknown error"));
      }
    }
  }, [socket, isMuted]);

  const stopVoice = useCallback(() => {
    // Stop all local tracks
    if (localStreamRef.current) {
      if (localStreamRef.current.getTracks) {
        localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      }
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    peerConnectionsRef.current.clear();

    // Clean up audio elements (web only)
    audioElementsRef.current.forEach((audio) => {
      try { audio.srcObject = null; } catch {}
    });
    audioElementsRef.current.clear();

    setIsVoiceEnabled(false);
  }, []);

  // Sync mute state with local stream
  useEffect(() => {
    if (localStreamRef.current?.getAudioTracks) {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Handle WebRTC signaling via socket
  useEffect(() => {
    if (!socket) return;

    const handlePeersList = async ({ peers }: { peers: string[] }) => {
      for (const peerNickname of peers) {
        if (peerNickname === nickname) continue;
        const pc = createPeerConnection(peerNickname);
        if (!pc) continue;
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

    const handleOffer = async ({ fromNickname, offer }: { fromNickname: string; offer: any }) => {
      const pc = createPeerConnection(fromNickname);
      if (!pc) return;
      const RTCSessionDesc = getRTCSessionDescription();
      try {
        await pc.setRemoteDescription(RTCSessionDesc ? new RTCSessionDesc(offer) : offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc_answer", { targetNickname: fromNickname, answer });
      } catch (err) {
        console.error("[WebRTC] Answer failed:", err);
      }
    };

    const handleAnswer = async ({ fromNickname, answer }: { fromNickname: string; answer: any }) => {
      const pc = peerConnectionsRef.current.get(fromNickname);
      if (pc) {
        const RTCSessionDesc = getRTCSessionDescription();
        try {
          if (pc.signalingState !== "stable") {
            await pc.setRemoteDescription(RTCSessionDesc ? new RTCSessionDesc(answer) : answer);
          }
        } catch (err) {
          console.error("[WebRTC] Set answer failed:", err);
        }
      }
    };

    const handleIceCandidate = async ({ fromNickname, candidate }: { fromNickname: string; candidate: any }) => {
      const pc = peerConnectionsRef.current.get(fromNickname);
      if (pc) {
        const RTCIceCand = getRTCIceCandidate();
        try {
          await pc.addIceCandidate(RTCIceCand ? new RTCIceCand(candidate) : candidate);
        } catch (err) {
          console.error("[WebRTC] ICE candidate failed:", err);
        }
      }
    };

    const handlePeerDisconnected = ({ nickname: peerNickname }: { nickname: string }) => {
      const pc = peerConnectionsRef.current.get(peerNickname);
      if (pc) {
        try { pc.close(); } catch {}
        peerConnectionsRef.current.delete(peerNickname);
      }
      if (Platform.OS === "web") {
        const audio = audioElementsRef.current.get(peerNickname);
        if (audio) {
          try { audio.srcObject = null; } catch {}
          audioElementsRef.current.delete(peerNickname);
        }
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
