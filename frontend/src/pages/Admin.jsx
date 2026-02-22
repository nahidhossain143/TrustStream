import { useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";

export default function Admin() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    if (!title.trim()) {
      setError("Please enter a news title.");
      return;
    }

    const formData = new FormData();
    formData.append("video", file);
    formData.append("title", title);
    formData.append("description", description);

    try {
      setUploading(true);
      setError("");
      setResult(null);
      setProgress(0);

      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const percent = Math.round((e.loaded * 100) / e.total);
          setProgress(percent);
        },
      });

      setResult(res.data);
      setTitle("");
      setDescription("");
      setFile(null);
    } catch (err) {
      console.error(err);
      setError("Upload failed ❌ — Check backend logs.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200">
      <Navbar />

      <div className="max-w-xl mx-auto mt-16 bg-gray-900/60 p-8 rounded-2xl border border-gray-800 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-white">
          📡 Admin Upload Panel
        </h2>

        {/* Title */}
        <label className="block text-sm text-gray-400 mb-1">News Title *</label>
        <input
          type="text"
          placeholder="e.g. Breaking: Election Results 2026"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500"
        />

        {/* Description */}
        <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
        <textarea
          placeholder="Short description of the news..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500 resize-none"
        />

        {/* File Input */}
        <label className="block text-sm text-gray-400 mb-1">Video File (MP4)</label>
        <input
          type="file"
          accept="video/mp4"
          onChange={e => setFile(e.target.files[0])}
          className="block w-full text-sm text-gray-300
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-lg file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-600 file:text-white
                     hover:file:bg-blue-700 mb-4"
        />

        {/* Selected file name */}
        {file && (
          <p className="text-xs text-gray-500 mb-4">
            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}

        {/* Upload Progress Bar */}
        {uploading && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>
                {progress < 100 ? "Uploading..." : "Processing & hashing segments..."}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress === 100 && (
              <p className="text-xs text-yellow-400 mt-1">
                ⏳ FFmpeg segmenting & generating hashes... please wait.
              </p>
            )}
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition disabled:opacity-40 font-semibold"
        >
          {uploading ? "Processing..." : "Upload & Generate Hashes"}
        </button>

        {/* Error */}
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}

        {/* Success Result */}
        {result && (
          <div className="mt-6 bg-gray-800 rounded-xl p-4 border border-green-700">
            <p className="text-green-400 font-semibold mb-3">✅ Upload Complete!</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p>📹 <span className="text-gray-400">Video ID:</span> {result.videoId}</p>
              <p>🔢 <span className="text-gray-400">Total Segments:</span> {result.totalSegments}</p>
              <p>🔗 <span className="text-gray-400">Playlist:</span>
                <a
                  href={`http://localhost:3001${result.playlistUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 ml-1 underline"
                >
                  {result.playlistUrl}
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}