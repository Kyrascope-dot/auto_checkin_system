import { useState, useRef } from "react";
import { detectFaces } from "../api/client";

export default function DetectPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setResults(null); setError("");
  }

  function drawBoxes(data) {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.style.width = img.width + "px"; canvas.style.height = img.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    data.results.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const matched = face.match !== null;
      const color = matched ? "#22c55e" : "#ef4444";

      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.shadowBlur = 0;

      const label = matched ? `${face.match.name} (${(face.similarity * 100).toFixed(1)}%)` : "Unknown";
      ctx.font = "600 14px Inter, system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x1, y1 - 28, tw + 16, 24, 8); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(label, x1 + 8, y1 - 10);
    });
  }

  async function handleDetect() {
    if (!file) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const data = await detectFaces(file);
      setResults(data);
      requestAnimationFrame(() => drawBoxes(data));
    } catch (err) { setError(err.response?.data?.detail || "Detection failed"); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Upload &amp; Detect</h1>

      <div className="flex gap-4 items-end mb-6">
        <div className="flex-1">
          <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition group">
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <div className="text-center">
              <svg className="w-7 h-7 mx-auto text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{file ? file.name : "Click to choose image"}</p>
            </div>
          </label>
        </div>
        <button onClick={handleDetect} disabled={!file || loading} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition shadow-lg shadow-indigo-500/25 whitespace-nowrap">
          {loading ? "Detecting…" : "Detect Faces"}
        </button>
      </div>

      {error && <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {preview && (
        <div className="relative inline-block">
          <img ref={imgRef} src={preview} alt="uploaded" className="max-w-full rounded-2xl border border-gray-200 dark:border-gray-700" onLoad={() => results && drawBoxes(results)} />
          <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" />
        </div>
      )}

      {results && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">{results.faces_found} face{results.faces_found !== 1 ? "s" : ""} found</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.results.map((face, i) => face.match ? (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg">{face.match.name[0]}</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{face.match.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{face.match.employee_id}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <dt className="text-gray-400">Department</dt><dd className="text-gray-900 dark:text-white">{face.match.department || "—"}</dd>
                  <dt className="text-gray-400">Designation</dt><dd className="text-gray-900 dark:text-white">{face.match.designation || "—"}</dd>
                  <dt className="text-gray-400">Similarity</dt><dd className="text-emerald-600 dark:text-emerald-400 font-medium">{(face.similarity * 100).toFixed(1)}%</dd>
                </dl>
              </div>
            ) : (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-500/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 font-bold text-lg">?</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Unknown</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Detection: {(face.confidence * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
