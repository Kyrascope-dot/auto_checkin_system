import { useState, useRef, useCallback } from "react";
import { enrollEmployee } from "../api/client";

export default function EnrollPage() {
  const [form, setForm] = useState({ name: "", employee_id: "", department: "", designation: "" });
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Camera state
  const [mode, setMode] = useState("upload"); // "upload" | "camera"
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  function handlePhotos(e) {
    const files = Array.from(e.target.files).slice(0, 5);
    addFiles(files);
  }

  function addFiles(files) {
    const all = [...photos, ...files].slice(0, 5);
    setPhotos(all);
    setPreviews(all.map((f) => f instanceof File ? URL.createObjectURL(f) : f._preview));
  }

  // Camera controls
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 720 }, height: { ideal: 960 }, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      setError("Camera access denied: " + err.message);
    }
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current || photos.length >= 5) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      file._preview = canvas.toDataURL("image/jpeg", 0.9);
      const next = [...photos, file].slice(0, 5);
      setPhotos(next);
      setPreviews(next.map((f) => f._preview || URL.createObjectURL(f)));
    }, "image/jpeg", 0.9);
  }

  function removePhoto(idx) {
    const next = photos.filter((_, i) => i !== idx);
    setPhotos(next);
    setPreviews(next.map((f) => f._preview || URL.createObjectURL(f)));
  }

  function switchMode(m) {
    if (m === mode) return;
    if (m === "upload" && cameraOn) stopCamera();
    setMode(m);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.employee_id || photos.length === 0) {
      setError("Name, Employee ID, and at least one photo are required.");
      return;
    }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await enrollEmployee(form, photos);
      setResult(res);
      setForm({ name: "", employee_id: "", department: "", designation: "" });
      setPhotos([]); setPreviews([]);
      if (cameraOn) stopCamera();
    } catch (err) { setError(err.response?.data?.detail || "Enrollment failed"); }
    finally { setLoading(false); }
  }

  const inputClass = "w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Enroll Employee</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Full Name *</label>
            <input name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Employee ID *</label>
            <input name="employee_id" value={form.employee_id} onChange={handleChange} className={inputClass} placeholder="EMP-001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Department</label>
            <input name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="Engineering" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Designation</label>
            <input name="designation" value={form.designation} onChange={handleChange} className={inputClass} placeholder="Software Engineer" />
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Face Photos * <span className="font-normal text-gray-400 dark:text-gray-500">({photos.length}/5)</span>
          </label>
          <div className="flex gap-1 mb-3 p-1 bg-gray-100 dark:bg-slate-800 rounded-lg w-fit">
            <button type="button" onClick={() => switchMode("upload")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition ${mode === "upload" ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
              Upload
            </button>
            <button type="button" onClick={() => switchMode("camera")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition ${mode === "camera" ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
              Camera
            </button>
          </div>

          {/* Upload mode */}
          {mode === "upload" && (
            <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition group">
              <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click to upload photos</p>
              </div>
            </label>
          )}

          {/* Camera mode */}
          {mode === "camera" && (
            <div className="space-y-3">
              <div className="relative w-full max-w-[280px] mx-auto aspect-[3/4] bg-black rounded-2xl overflow-hidden">
                <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {!cameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button type="button" onClick={startCamera} className="px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium rounded-xl hover:bg-white/20 transition">
                      Open camera
                    </button>
                  </div>
                )}
              </div>
              {cameraOn && (
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={capturePhoto} disabled={photos.length >= 5}
                    className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth={2}/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
                    Capture {photos.length >= 5 ? "(max 5)" : `(${photos.length}/5)`}
                  </button>
                  <button type="button" onClick={stopCamera} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">
                    Stop
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Previews */}
          {previews.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {previews.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                  <button type="button" onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition shadow-lg shadow-indigo-500/25">
          {loading ? "Enrolling…" : "Enroll Employee"}
        </button>
      </form>

      {error && <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {result?.success && (
        <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Enrolled {result.employee.name} with {result.employee.photo_count} photo(s)</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-1">ID: {result.employee.id}</p>
        </div>
      )}
    </div>
  );
}
