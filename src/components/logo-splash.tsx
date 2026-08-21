export function LogoSplash() {
  return (
    <div className="mb-8 mt-8 flex justify-center">
      {/* Files in public/ are copied verbatim and served under the deploy path, so a
          bare '/LogoSplash.jpeg' 404s wherever that path is not the domain root. */}
      <img
        src={`${import.meta.env.BASE_URL}LogoSplash.webp`}
        alt="PeerConnect"
        className="w-[70%] max-w-xs object-contain"
      />
    </div>
  );
}
