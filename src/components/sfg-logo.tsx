export function SfgLogo({ className = "sfg-hub-logo" }: { className?: string }) {
  return (
    // Brand file is an SVG lockup. next/image would require a global SVG exception.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/sfg-logo.svg"
      alt="Strategic Financial Group"
      width={61}
      height={32}
      className={className}
    />
  );
}
