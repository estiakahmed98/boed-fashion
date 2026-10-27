import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { homeImages } from "@/lib/editorial-images";

/** Read the four admin-managed image slots fresh for each home-page request. */
export async function getEditorialBannerImages() {
  await connection();
  const now = new Date();
  const banners = await prisma.banner.findMany({
    where: {
      type: { in: ["HERO", "BANNER1"] },
      position: { in: [1, 2] },
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
    // If a slot is duplicated, the most recently edited active banner wins.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { type: true, position: true, image: true },
  });
  const imageFor = (type: "HERO" | "BANNER1", position: number) =>
    banners.find(banner => banner.type === type && banner.position === position && banner.image.trim())?.image;
  const hero = imageFor("HERO", 1) || homeImages.hero;
  const summer = imageFor("BANNER1", 1) || homeImages.summer;
  return {
    hero,
    heroMobile: imageFor("HERO", 2) || hero,
    summer,
    summerMobile: imageFor("BANNER1", 2) || summer,
  };
}
