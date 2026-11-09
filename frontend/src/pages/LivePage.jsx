import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const DETECT_INTERVAL_MS = 1500;
const VOICE_COOLDOWN_MS = 30_000;
const UNKNOWN_ANNOUNCE_THRESHOLD = 3;

const spokenRecently = new Map();
let unknownStreakCount = 0;
function speak(text) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  const voices = speechSynthesis.getVoices();
  const pref =
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google")) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (pref) u.voice = pref;
  speechSynthesis.speak(u);
}
function announceIfNeeded(name, message) {
  const key = `${name}:${message}`;
  const now = Date.now();
  if (
    spokenRecently.has(key) &&
    now - spokenRecently.get(key) < VOICE_COOLDOWN_MS
  )
    return;
  spokenRecently.set(key, now);
  speak(message);
}

function ScanOverlay({ faces }) {
  const best = faces[0];
  const matched = best?.match !== null;
  const isNew = best?.just_checked_in;
  const alreadyIn = best?.already_checked_in;

  let statusClass = "scan-idle";
  if (!matched) statusClass = "scan-unknown";
  else if (isNew) statusClass = "scan-new";
  else if (alreadyIn) statusClass = "scan-done";
  else statusClass = "scan-match";

  return (
    <div className={`scan-frame ${statusClass}`}>
      <div className="scan-corner tl" />
      <div className="scan-corner tr" />
      <div className="scan-corner bl" />
      <div className="scan-corner br" />
      <div className="scan-beam" />
      <div className="scan-results">
        {faces.map((face, i) => {
          const fm = face.match;
          return (
            <div
              key={i}
              className={`scan-pill ${face.just_checked_in ? "pill-new" : face.already_checked_in ? "pill-done" : fm ? "pill-match" : "pill-unknown"}`}
            >
              <span className="pill-name">
                {fm ? fm.name : "Not enrolled"}
              </span>
              {face.just_checked_in && (
                <span className="pill-tag">Checked in</span>
              )}
              {face.just_checked_out && (
                <span className="pill-tag pill-checkout">Checked out</span>
              )}
              {face.already_checked_out && (
                <span className="pill-tag pill-checkout">Already out</span>
              )}
              {face.already_checked_in && (
                <span className="pill-tag">Already in</span>
              )}
              {fm && !face.just_checked_in && !face.already_checked_in && (
                <span className="pill-tag">
                  {(face.similarity * 100).toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LivePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const intervalRef = useRef(null);
  const processingRef = useRef(false);
  const checkinActiveRef = useRef(false);
  const ipImgRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [results, setResults] = useState(null);
  const [todayCheckins, setTodayCheckins] = useState([]);

  const [checkinActive, setCheckinActive] = useState(false);
  const [checkinEndTime, setCheckinEndTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [duration, setDuration] = useState(30);
  const [showConfig, setShowConfig] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const [sessionMode, setSessionMode] = useState("checkin");
  const sessionModeRef = useRef("checkin");

  const [camSource, setCamSource] = useState("webcam");
  const [extStatus, setExtStatus] = useState(null);
  const camSourceRef = useRef("webcam");

  useEffect(() => { camSourceRef.current = camSource; }, [camSource]);
  useEffect(() => { checkinActiveRef.current = checkinActive; }, [checkinActive]);
  useEffect(() => { sessionModeRef.current = sessionMode; }, [sessionMode]);

  useEffect(() => {
    axios.get("/api/camera/status").then((r) => setExtStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (camSource === "webcam") {
      startWebcam();
      return () => stopWebcam();
    } else {
      stopWebcam();
      setCameraReady(true);
    }
  }, [camSource]);

  async function startWebcam() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err) {
      setCameraError("Camera access denied: " + err.message);
    }
  }

  function stopWebcam() {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }

  useEffect(() => {
    if (camSource !== "external") return;
    if (ipImgRef.current) ipImgRef.current.src = "/api/camera/stream";
    return () => { if (ipImgRef.current) ipImgRef.current.src = ""; };
  }, [camSource]);

  useEffect(() => {
    if (!checkinActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setResults(null);
      return;
    }
    if (camSource === "webcam" && !cameraReady) return;
    intervalRef.current = setInterval(captureAndDetect, DETECT_INTERVAL_MS);
    captureAndDetect();
    return () => clearInterval(intervalRef.current);
  }, [cameraReady, checkinActive, camSource]);

  async function captureAndDetect() {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      let res;
      const isActive = checkinActiveRef.current;
      const source = camSourceRef.current;
      const mode = sessionModeRef.current;

      if (source === "external") {
        res = await axios.post(
          isActive ? `/api/camera/live-detect?mode=${mode}` : "/api/camera/detect",
        );
      } else {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
        if (!blob) return;
        const form = new FormData();
        form.append("image", blob, "frame.jpg");
        res = await axios.post(
          isActive ? `/api/live-detect?mode=${mode}` : "/api/detect",
          form,
        );
      }
      setResults(res.data);
      if (isActive && voiceEnabled) {
        let hasUnknownFace = false;
        for (const face of res.data.results || []) {
          if (face.just_checked_in && face.match)
            announceIfNeeded(face.match.name, `Mr. ${face.match.name}, you have checked in successfully.`);
          else if (face.just_checked_out && face.match)
            announceIfNeeded(face.match.name + ":checkout", `Mr. ${face.match.name}, you have checked out successfully. Have a good day.`);
          else if (face.already_checked_out && face.match)
            announceIfNeeded(face.match.name + ":alreadyout", `Mr. ${face.match.name}, you have already checked out.`);
          else if (face.already_checked_in && face.match)
            announceIfNeeded(face.match.name, `Mr. ${face.match.name}, you are already checked in.`);
          else if (!face.match && face.confidence > 0.5)
            hasUnknownFace = true;
        }
        if (hasUnknownFace) {
          unknownStreakCount++;
          if (unknownStreakCount >= UNKNOWN_ANNOUNCE_THRESHOLD)
            announceIfNeeded("unknown_face", "You have not enrolled yet. Please enroll first and then check in.");
        } else {
          unknownStreakCount = 0;
        }
      }
      if (isActive) {
        const changed = (res.data.results || []).filter((r) => r.just_checked_in || r.just_checked_out);
        if (changed.length > 0) loadCheckins();
      }
    } catch {
    } finally {
      processingRef.current = false;
    }
  }

  function startSession(mode) {
    setSessionMode(mode);
    setCheckinEndTime(new Date(Date.now() + duration * 60 * 1000));
    setCheckinActive(true);
    setShowConfig(false);
    spokenRecently.clear();
    unknownStreakCount = 0;
    if (voiceEnabled)
      speak(`${mode === "checkout" ? "Check-out" : "Check-in"} session started for ${duration} minutes.`);
  }

  async function stopSession() {
    const wasMode = sessionModeRef.current;
    setCheckinActive(false);
    setCheckinEndTime(null);
    setTimeRemaining("");
    setSessionMode("checkin");
    if (voiceEnabled) {
      if (wasMode === "checkin") {
        try {
          const [empRes, ciRes] = await Promise.all([
            axios.get("/api/employees"),
            axios.get("/api/checkins/today"),
          ]);
          const done = new Set(ciRes.data.checkins.map((c) => c.internal_id));
          const missed = empRes.data.employees.filter((e) => !done.has(e.id));
          setTimeout(() => {
            speak("Check-in session ended.");
            missed.forEach((emp, i) =>
              setTimeout(() => speak(`Mr. ${emp.name} has not checked in yet.`), (i + 1) * 2500),
            );
          }, 1000);
        } catch {
          speak("Check-in session ended.");
        }
      } else {
        speak("Check-out session ended.");
      }
    }
  }

  useEffect(() => {
    if (!checkinActive || !checkinEndTime) return;
    const tick = setInterval(() => {
      const diff = checkinEndTime - Date.now();
      if (diff <= 0) { stopSession(); return; }
      setTimeRemaining(
        `${Math.floor(diff / 60000)}:${Math.floor((diff % 60000) / 1000).toString().padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [checkinActive, checkinEndTime]);

  const loadCheckins = useCallback(async () => {
    try { setTodayCheckins((await axios.get("/api/checkins/today")).data.checkins); } catch {}
  }, []);
  useEffect(() => { loadCheckins(); }, [loadCheckins]);

  function switchSource(src) {
    if (src === camSource) return;
    setResults(null);
    setCameraError("");
    setCamSource(src);
  }

  const faceCount = results?.faces_found || 0;
  const extAvailable = extStatus?.configured && extStatus?.reachable;

  return (
    <div className="live-layout">
      {/* ── Camera panel ─────────────────────────────────────── */}
      <div className="cam-panel">
        {/* Toolbar row 1: session controls */}
        <div className="cam-toolbar">
          <div className="cam-toolbar-left">
            {!checkinActive ? (
              <>
                <button onClick={() => startSession("checkin")} className="btn-session btn-checkin">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12 2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Check-in
                  <span className="btn-dur">{duration}m</span>
                </button>
                <button onClick={() => startSession("checkout")} className="btn-session btn-checkout">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 8h6M11 8l-2.5-2.5M11 8l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Check-out
                  <span className="btn-dur">{duration}m</span>
                </button>
                <button onClick={() => setShowConfig(!showConfig)} className="btn-icon" title="Duration">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </button>
              </>
            ) : (
              <>
                <div className={`timer-chip ${sessionMode === "checkout" ? "timer-checkout" : ""}`}>
                  <span className="timer-dot" />
                  <span className="timer-label">{sessionMode === "checkout" ? "OUT" : "IN"}</span>
                  <span className="timer-val">{timeRemaining}</span>
                </div>
                <button onClick={stopSession} className="btn-stop">End session</button>
              </>
            )}
          </div>
          <div className="cam-toolbar-right">
            <div className="src-toggle">
              <button type="button" onClick={() => switchSource("webcam")} className={`src-btn ${camSource === "webcam" ? "src-active" : ""}`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
                Webcam
              </button>
              <button type="button" onClick={() => switchSource("external")} className={`src-btn ${camSource === "external" ? "src-active" : ""}`}
                title={extAvailable ? `Connected: ${extStatus.ip}` : "External camera — configure in .env"}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                IP Cam
                {camSource === "external" && extAvailable && <span className="src-dot" />}
              </button>
            </div>
            <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`btn-icon ${voiceEnabled ? "active" : ""}`} title="Voice announcements">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                {voiceEnabled ? (
                  <>
                    <path d="M3.5 6h-1a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h1l3 2.5V3.5l-3 2.5z" fill="currentColor"/>
                    <path d="M9.5 5.5a3.5 3.5 0 010 5M11.5 3.5a6.5 6.5 0 010 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </>
                ) : (
                  <>
                    <path d="M3.5 6h-1a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h1l3 2.5V3.5l-3 2.5z" fill="currentColor"/>
                    <path d="M10 6l4 4M14 6l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {showConfig && !checkinActive && (
          <div className="dur-bar">
            {[15, 30, 45, 60].map((m) => (
              <button key={m} onClick={() => setDuration(m)} className={`dur-opt ${duration === m ? "sel" : ""}`}>
                {m} min
              </button>
            ))}
          </div>
        )}

        {cameraError && <p className="cam-err">{cameraError}</p>}

        {/* ── Viewfinder ──────────────────────────────────────── */}
        <div ref={containerRef} className="viewfinder">
          {camSource === "webcam" ? (
            <video ref={videoRef} muted playsInline className="vf-video" />
          ) : (
            <img ref={ipImgRef} alt="External camera" className="vf-video" style={{ objectFit: "cover" }} />
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {faceCount > 0 && <ScanOverlay faces={results.results} />}
          {(cameraReady || camSource === "external") && (
            <div className="vf-live">
              <span className="vf-live-dot" />
              {checkinActive ? timeRemaining : camSource === "external" ? "External" : "Live"}
            </div>
          )}
          {camSource === "external" && extStatus && !extAvailable && (
            <div className="vf-prompt">
              {!extStatus.configured
                ? "Set CAMERA_IP and CAMERA_PASS in backend/.env"
                : `Camera at ${extStatus.ip} is not reachable`}
            </div>
          )}
        </div>

        {/* Detection cards below camera */}
        {faceCount > 0 && (
          <div className="det-strip">
            {results.results.map((face, i) => (
              <div key={i} className={`det-card ${face.just_checked_in ? "det-new" : face.just_checked_out ? "det-checkout" : face.already_checked_out ? "det-checkout" : face.match ? "det-ok" : "det-unk"}`}>
                <div className="det-avatar">
                  {face.match ? face.match.name[0] : "?"}
                </div>
                <div className="det-info">
                  <span className="det-name">
                    {face.match ? face.match.name : "Unknown"}
                  </span>
                  <span className="det-meta">
                    {face.just_checked_in ? "Just checked in"
                      : face.just_checked_out ? "Just checked out"
                      : face.already_checked_out ? "Already checked out"
                      : face.already_checked_in ? "Already checked in"
                      : face.match ? `${face.match.employee_id} · ${(face.similarity * 100).toFixed(0)}%`
                      : "Not enrolled"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sb-header">
          <h3 className="sb-title">Today's Log</h3>
          <span className="sb-date">
            {new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </div>

        <div className="sb-log">
          {todayCheckins.length === 0 ? (
            <div className="sb-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <span>No check-ins yet today</span>
            </div>
          ) : (
            todayCheckins.map((c, i) => {
              const dtIn = new Date(c.checked_in_at);
              const dtOut = c.checked_out_at ? new Date(c.checked_out_at) : null;
              return (
                <div key={i} className={`log-row ${dtOut ? "log-completed" : ""}`}>
                  <div className={`log-avatar ${dtOut ? "log-avatar-done" : ""}`}>{c.name[0]}</div>
                  <div className="log-info">
                    <span className="log-name">{c.name}</span>
                    <span className="log-id">
                      {c.employee_id}{c.department ? ` · ${c.department}` : ""}
                    </span>
                  </div>
                  <div className="log-datetime">
                    <span className="log-time">
                      {dtIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {dtOut && (
                      <span className="log-checkout-time">
                        → {dtOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {dtOut && c.working_hours != null && (
                      <span className="log-hours">{c.working_hours.toFixed(1)}h</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {todayCheckins.length > 0 && (
          <div className="sb-footer">
            <span className="sb-count-badge">{todayCheckins.length} checked in</span>
            {todayCheckins.filter(c => c.checked_out_at).length > 0 && (
              <span className="sb-count-badge sb-count-out">
                {todayCheckins.filter(c => c.checked_out_at).length} checked out
              </span>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
