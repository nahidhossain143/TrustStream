export default function NewsCard({ news, onSelect, active }) {
  return (
    <div
      onClick={() => onSelect(news)}
      className={`p-4 rounded-xl cursor-pointer transition-all duration-300 border 
      ${
        active
          ? "bg-gray-800 border-blue-500"
          : "bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800"
      }`}
    >
      <h3 className="font-semibold text-white text-sm">
        {news.title}
      </h3>
      <p className="text-xs text-gray-400 mt-2">
        {news.description}
      </p>
    </div>
  );
}