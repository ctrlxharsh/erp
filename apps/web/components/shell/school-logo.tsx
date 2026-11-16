import Image from "next/image";

/** Shows a logo image, or the school's initials on a navy tile when there is no logo. */
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
    return <Image src={logoSrc} alt="" width={size} height={size} className="rounded-md" />;
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
      className="flex shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
    >
      {initials}
    </span>
  );
}
