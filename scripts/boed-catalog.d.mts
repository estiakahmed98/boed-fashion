export type BoedReview = {
  sourceId: string;
  sourceUrl: string;
  sourceCategory: string;
  priceSource: string;
  stockSource: string;
  descriptionSource: string;
  requiresPriceVerification: boolean;
  requiresStockVerification: boolean;
  requiresSizeVerification: boolean;
  requiresDescriptionReview: boolean;
  needsReview: boolean;
  candidateSizes: string[];
  estimatedStock: number;
};
export type NormalizedBoedProduct = {
  categories: Array<{ name: string; slug: string }>;
  product: {
    name: string; slug: string; sku: string; type: string;
    description: string; basePrice: number; currency: string;
    image: string | null; gallery: string[]; available: boolean; featured: boolean;
  };
  variants: Array<{
    sku: string; price: number; currency: string; stock: number;
    active: boolean; isDefault: boolean;
    options: { Size?: string; __meta: BoedReview };
  }>;
  verifiedSizes: string[];
  review: BoedReview;
};
export function normalizeBoedCatalog(source: unknown): NormalizedBoedProduct[];
export function categorySlug(name: string): string;
export function boedMediaPath(value: string): string;
