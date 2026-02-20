export default function VideoPlayer({ url }) {
  return (
    <div className="relative rounded-xl overflow-hidden shadow-2xl">
      <video
        src={url}
        controls
        className="w-full rounded-xl"
      />
    </div>
  );
}