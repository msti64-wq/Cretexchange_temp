import { cn } from "@/lib/utils";

export const CRETEXCHANGE_BRAND = {
  corporateLogo: "/brand/cretexchange-corporate-horizontal-logo.png",
  compactMark: "/brand/cretexchange-cx-mark.png",
  primaryHero: "/brand/cretexchange-primary-hero-logo.png",
} as const;

type BrandHeaderLogoProps = {
  alt?: string;
  className?: string;
  size?: "header" | "compact";
};

const SIZES = {
  header: {
    desktop: "h-12 max-w-[236px]",
    mobile: "h-10 max-w-[76px]",
  },
  compact: {
    desktop: "h-11 max-w-[214px]",
    mobile: "h-9 max-w-[68px]",
  },
} as const;

/**
 * Uses the approved corporate wordmark where it is readable and the approved
 * compact mark only below the mobile breakpoint. Header consumers deliberately
 * never use the square installed-app artwork.
 */
export function BrandHeaderLogo({ alt = "CreteXchange", className, size = "header" }: BrandHeaderLogoProps) {
  const dimensions = SIZES[size];

  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <img
        src={CRETEXCHANGE_BRAND.corporateLogo}
        alt={alt}
        width={487}
        height={208}
        className={cn("hidden w-auto object-contain sm:block", dimensions.desktop)}
        data-testid="brand-header-logo-desktop"
      />
      <img
        src={CRETEXCHANGE_BRAND.compactMark}
        alt={alt}
        width={310}
        height={190}
        className={cn("w-auto object-contain sm:hidden", dimensions.mobile)}
        data-testid="brand-header-logo-mobile"
      />
    </span>
  );
}

export function BrandCompactMark({ alt = "CreteXchange", className }: Pick<BrandHeaderLogoProps, "alt" | "className">) {
  return (
    <img
      src={CRETEXCHANGE_BRAND.compactMark}
      alt={alt}
      width={310}
      height={190}
      className={cn("h-10 w-auto object-contain", className)}
    />
  );
}
