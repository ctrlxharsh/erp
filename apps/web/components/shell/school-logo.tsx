/** Shows a logo image, or the school's initials on a white tile (it sits on the navy top bar) when there is no logo. */
export function SchoolLogo({
  name,
  logoSrc,
  size = 36,
}: {
  name: string;
  logoSrc?: string;
  size?: number;
}) {
  if (logoSrc) {
    // A plain <img>: the link is a short-lived signed URL, which must not go through the image optimizer.
    return (
      // biome-ignore lint/performance/noImgElement: signed storage URL, see above
      <img
        src={logoSrc}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md bg-background object-contain p-0.5"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-md bg-background text-sm font-bold text-primary"
    >
      {initials}
    </span>
  );
}
