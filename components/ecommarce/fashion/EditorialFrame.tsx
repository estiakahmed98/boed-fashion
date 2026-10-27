import type { ReactNode } from "react";
import { getStorefrontCatalogProducts, parseCatalogFilters } from "@/lib/storefront-catalog";
import { getSiteSettingsForSeo } from "@/lib/seo";
import { EditorialShell } from "./EditorialShell";

export async function EditorialFrame({ children }: { children: ReactNode }) {
  const [catalog, settings] = await Promise.all([
    getStorefrontCatalogProducts(parseCatalogFilters({ sort: "popular", perPage: "12" })).catch(() => null),
    getSiteSettingsForSeo(),
  ]);
  const highlights = (catalog?.products ?? []).slice(0, 3).map(({ id, slug, name, image }) => ({ id, slug, name, image }));
  const socials = [
    { name: "Facebook", href: settings.facebookLink },
    { name: "Instagram", href: settings.instagramLink },
    { name: "YouTube", href: settings.youtubeLink },
    { name: "X", href: settings.twitterLink },
  ].filter((item): item is { name: string; href: string } => Boolean(item.href && /^https?:\/\//.test(item.href)));
  return <EditorialShell highlights={highlights} socials={socials}>{children}</EditorialShell>;
}
