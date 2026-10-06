export function SalonLogo({
  tone = "espresso",
  className = "so-logo",
}: {
  tone?: "espresso" | "warmwhite";
  className?: string;
}) {
  const src =
    tone === "warmwhite"
      ? "/brand/luna-haus-logo-warmwhite.svg"
      : "/brand/luna-haus-logo-espresso.svg";
  return (
    // Brand file is an SVG lockup. next/image would require a global SVG exception.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Luna Haus Salon" width={1024} height={276} className={className} />
  );
}
