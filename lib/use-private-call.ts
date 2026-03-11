import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { crossInfo } from "./cross-alert";
import { useChat } from "./chat-context";

// Dynamically import react-native-webrtc on native
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
    console.warn("[PrivateCall] react-native-webrtc not available:", e);
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
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export type CallState =
  | "idle"
  | "calling"          // outgoing audio call ringing
  | "calling_video"    // outgoing video call ringing
  | "incoming"         // incoming audio call alert
  | "incoming_video"   // incoming video call alert
  | "connected"        // in audio call
  | "connected_video"  // in video call
  | "ended";

export function usePrivateCall() {
  const { socket, nickname } = useChat();
  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");
  const setCallStateSync = useCallback((s: CallState) => {
    callStateRef.current = s;
    setCallState(s);
  }, []);
  const [callPartner, setCallPartner] = useState<string | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [callDuration, setCallDurationState] = useState(0);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const audioElementRef = useRef<any>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether current/incoming call is video
  const isVideoCallRef = useRef(false);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      try {
        if (localStreamRef.current.getTracks) {
          localStreamRef.current.getTracks().forEach((t: any) => t.stop());
        }
      } catch {}
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (audioElementRef.current) {
      try { audioElementRef.current.srcObject = null; } catch {}
      audioElementRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    setCallDurationState(0);
    setRemoteStream(null);
    isVideoCallRef.current = false;
  }, []);

  const createPC = useCallback((partnerNickname: string, withVideo: boolean) => {
    const PeerConnection = getRTCPeerConnection();
    if (!PeerConnection) return null;

    const pc = new PeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event: any) => {
      if (event.candidate && socket) {
        socket.emit("private_webrtc_ice", {
          targetNickname: partnerNickname,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event: any) => {
      const stream = event.streams?.[0] || event.stream;
      if (!stream) return;
      setRemoteStream(stream);
      if (Platform.OS === "web" && !withVideo) {
        // Audio only — play via Audio element
        if (!audioElementRef.current) {
          audioElementRef.current = new Audio();
          audioElementRef.current.autoplay = true;
        }
        audioElementRef.current.srcObject = stream;
        audioElementRef.current.play().catch(() => {});
      }
    };

    pc.onaddstream = (event: any) => {
      // react-native-webrtc older API
      if (event.stream) {
        setRemoteStream(event.stream);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        setCallStateSync(withVideo ? "connected_video" : "connected");
        setCallDurationState(0);
        callTimerRef.current = setInterval(() => {
          setCallDurationState((d) => d + 1);
        }, 1000);
      } else if (state === "failed" || state === "closed" || state === "disconnected") {
        cleanup();
        setCallStateSync("ended");
        setCallPartner(null);
        setTimeout(() => setCallStateSync("idle"), 2000);
      }
    };

    return pc;
  }, [socket, cleanup, setCallStateSync]);

  // ── Initiate an audio call ──
  const startCall = useCallback(async (targetNickname: string) => {
    if (callStateRef.current !== "idle") return;
    if (!socket) { crossInfo("Not connected", "Please join a room first."); return; }
    isVideoCallRef.current = false;
    setCallPartner(targetNickname);
    setCallStateSync("calling");
    socket.emit("private_call_request", { targetNickname, isVideo: false });
    ringTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === "calling") {
        socket.emit("private_call_end", { targetNickname });
        cleanup();
        setCallStateSync("idle");
        setCallPartner(null);
        crossInfo("No Answer", `${targetNickname} didn't answer.`);
      }
    }, 30000);
  }, [socket, cleanup, setCallStateSync]);

  // ── Initiate a video call ──
  const startVideoCall = useCallback(async (targetNickname: string) => {
    if (callStateRef.current !== "idle") return;
    if (!socket) { crossInfo("Not connected", "Please join a room first."); return; }
    isVideoCallRef.current = true;
    setCallPartner(targetNickname);
    setCallStateSync("calling_video");
    socket.emit("private_call_request", { targetNickname, isVideo: true });
    ringTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === "calling_video") {
        socket.emit("private_call_end", { targetNickname });
        cleanup();
        setCallStateSync("idle");
        setCallPartner(null);
        crossInfo("No Answer", `${targetNickname} didn't answer.`);
      }
    }, 30000);
  }, [socket, cleanup, setCallStateSync]);

  // ── Accept an incoming audio call ──
  const acceptCall = useCallback(async () => {
    if (!incomingFrom || !socket) return;
    const from = incomingFrom;
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    setCallPartner(from);
    setIncomingFrom(null);
    isVideoCallRef.current = false;
    try {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices) { crossInfo("Error", "Microphone not available"); socket.emit("private_call_reject", { targetNickname: from }); setCallStateSync("idle"); return; }
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch {
      crossInfo("Error", "Could not access microphone");
      socket.emit("private_call_reject", { targetNickname: from });
      setCallStateSync("idle");
      return;
    }
    const pc = createPC(from, false);
    if (!pc) { setCallStateSync("idle"); return; }
    pcRef.current = pc;
    if (localStreamRef.current) {
      if (pc.addStream) { pc.addStream(localStreamRef.current); }
      else { localStreamRef.current.getTracks().forEach((t: any) => pc.addTrack(t, localStreamRef.current)); }
    }
    socket.emit("private_call_accept", { targetNickname: from, isVideo: false });
    setCallStateSync("connected");
  }, [incomingFrom, socket, createPC, setCallStateSync]);

  // ── Accept an incoming video call ──
  const acceptVideoCall = useCallback(async () => {
    if (!incomingFrom || !socket) return;
    const from = incomingFrom;
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    setCallPartner(from);
    setIncomingFrom(null);
    isVideoCallRef.current = true;
    try {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices) { crossInfo("Error", "Camera/microphone not available"); socket.emit("private_call_reject", { targetNickname: from }); setCallStateSync("idle"); return; }
      const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch {
      crossInfo("Error", "Could not access camera/microphone");
      socket.emit("private_call_reject", { targetNickname: from });
      setCallStateSync("idle");
      return;
    }
    const pc = createPC(from, true);
    if (!pc) { setCallStateSync("idle"); return; }
    pcRef.current = pc;
    if (localStreamRef.current) {
      if (pc.addStream) { pc.addStream(localStreamRef.current); }
      else { localStreamRef.current.getTracks().forEach((t: any) => pc.addTrack(t, localStreamRef.current)); }
    }
    socket.emit("private_call_accept", { targetNickname: from, isVideo: true });
    setCallStateSync("connected_video");
  }, [incomingFrom, socket, createPC, setCallStateSync]);

  // ── Reject an incoming call ──
  const rejectCall = useCallback(() => {
    if (!incomingFrom || !socket) return;
    socket.emit("private_call_reject", { targetNickname: incomingFrom });
    setIncomingFrom(null);
    setCallStateSync("idle");
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
  }, [incomingFrom, socket, setCallStateSync]);

  // ── End an active call ──
  const endCall = useCallback(() => {
    if (!socket || !callPartner) return;
    socket.emit("private_call_end", { targetNickname: callPartner });
    cleanup();
    setCallStateSync("idle");
    setCallPartner(null);
  }, [socket, callPartner, cleanup, setCallStateSync]);

  // ── Socket event handlers ──
  useEffect(() => {
    if (!socket) return;

    const handleIncoming = ({ fromNickname, isVideo }: { fromNickname: string; isVideo?: boolean }) => {
      if (callStateRef.current !== "idle") {
        socket.emit("private_call_reject", { targetNickname: fromNickname });
        return;
      }
      isVideoCallRef.current = !!isVideo;
      setIncomingFrom(fromNickname);
      setCallStateSync(isVideo ? "incoming_video" : "incoming");
      ringTimeoutRef.current = setTimeout(() => {
        socket.emit("private_call_reject", { targetNickname: fromNickname });
        setIncomingFrom(null);
        setCallStateSync("idle");
      }, 30000);
    };

    const handleAccepted = async ({ fromNickname, isVideo }: { fromNickname: string; isVideo?: boolean }) => {
      if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
      const withVideo = !!isVideo;
      try {
        const mediaDevices = getMediaDevices();
        if (!mediaDevices) { crossInfo("Error", withVideo ? "Camera/microphone not available" : "Microphone not available"); endCall(); return; }
        const stream = await mediaDevices.getUserMedia({ audio: true, video: withVideo });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        crossInfo("Error", withVideo ? "Could not access camera/microphone" : "Could not access microphone");
        endCall();
        return;
      }
      const pc = createPC(fromNickname, withVideo);
      if (!pc) { endCall(); return; }
      pcRef.current = pc;
      if (localStreamRef.current) {
        if (pc.addStream) { pc.addStream(localStreamRef.current); }
        else { localStreamRef.current.getTracks().forEach((t: any) => pc.addTrack(t, localStreamRef.current)); }
      }
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: withVideo });
        await pc.setLocalDescription(offer);
        socket.emit("private_webrtc_offer", { targetNickname: fromNickname, offer });
      } catch (err) {
        console.error("[PrivateCall] Offer failed:", err);
        endCall();
      }
    };

    const handleRejected = ({ fromNickname, reason }: { fromNickname: string; reason: string }) => {
      cleanup();
      setCallStateSync("idle");
      setCallPartner(null);
      crossInfo("Call Declined", reason || `${fromNickname} declined the call.`);
    };

    const handleEnded = ({ fromNickname }: { fromNickname: string }) => {
      cleanup();
      setCallStateSync("ended");
      setCallPartner(null);
      setTimeout(() => setCallStateSync("idle"), 1500);
    };

    const handleOffer = async ({ fromNickname, offer }: { fromNickname: string; offer: any }) => {
      const pc = pcRef.current;
      if (!pc) return;
      const RTCSessionDesc = getRTCSessionDescription();
      try {
        await pc.setRemoteDescription(RTCSessionDesc ? new RTCSessionDesc(offer) : offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("private_webrtc_answer", { targetNickname: fromNickname, answer });
      } catch (err) {
        console.error("[PrivateCall] Answer failed:", err);
      }
    };

    const handleAnswer = async ({ fromNickname, answer }: { fromNickname: string; answer: any }) => {
      const pc = pcRef.current;
      if (!pc) return;
      const RTCSessionDesc = getRTCSessionDescription();
      try {
        if (pc.signalingState !== "stable") {
          await pc.setRemoteDescription(RTCSessionDesc ? new RTCSessionDesc(answer) : answer);
        }
      } catch (err) {
        console.error("[PrivateCall] Set answer failed:", err);
      }
    };

    const handleIce = async ({ fromNickname, candidate }: { fromNickname: string; candidate: any }) => {
      const pc = pcRef.current;
      if (!pc) return;
      const RTCIceCand = getRTCIceCandidate();
      try {
        await pc.addIceCandidate(RTCIceCand ? new RTCIceCand(candidate) : candidate);
      } catch (err) {
        console.error("[PrivateCall] ICE failed:", err);
      }
    };

    socket.on("private_call_incoming", handleIncoming);
    socket.on("private_call_accepted", handleAccepted);
    socket.on("private_call_rejected", handleRejected);
    socket.on("private_call_ended", handleEnded);
    socket.on("private_webrtc_offer", handleOffer);
    socket.on("private_webrtc_answer", handleAnswer);
    socket.on("private_webrtc_ice", handleIce);

    return () => {
      socket.off("private_call_incoming", handleIncoming);
      socket.off("private_call_accepted", handleAccepted);
      socket.off("private_call_rejected", handleRejected);
      socket.off("private_call_ended", handleEnded);
      socket.off("private_webrtc_offer", handleOffer);
      socket.off("private_webrtc_answer", handleAnswer);
      socket.off("private_webrtc_ice", handleIce);
    };
  }, [socket, createPC, cleanup, endCall, setCallStateSync]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return {
    callState,
    callPartner,
    incomingFrom,
    callDuration: formatDuration(callDuration),
    localStream,
    remoteStream,
    startCall,
    startVideoCall,
    acceptCall,
    acceptVideoCall,
    rejectCall,
    endCall,
  };
}
