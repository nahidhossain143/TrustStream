import { useEffect, useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import NewsCard from "../components/NewsCard";
import VideoPlayer from "../components/VideoPlayer";
import VerificationBadge from "../components/VerificationBadge";

export default function Home() {
  const [newsList, setNewsList] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/news").then(res => {
      setNewsList(res.data);
      setSelected(res.data[0]);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200">
      <Navbar />

      <div className="grid lg:grid-cols-4 gap-8 p-8">
        
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Latest News
          </h2>

          {newsList.map(news => (
            <NewsCard
              key={news.id}
              news={news}
              onSelect={setSelected}
              active={selected?.id === news.id}
            />
          ))}
        </div>

        {/* Main Player */}
        <div className="lg:col-span-3">
          {selected && (
            <>
              <div className="bg-gray-900/60 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-800">
                <VideoPlayer url={selected.videoUrl} />
                <h1 className="text-2xl font-bold mt-6">
                  {selected.title}
                </h1>
                <p className="text-gray-400 mt-2">
                  {selected.description}
                </p>

                <VerificationBadge verified={selected.verified} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}