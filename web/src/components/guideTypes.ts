export type GuideStats = {
  views: number;
  requests: number;
  downloaded: number;
  openDownloads: number;
  totalDownloads: number;
  requestRate: number;
  downloadRate: number;
  leads: number;
  reachedViewing: number;
  won: number;
  gatedViews: number;
  openViews: number;
  newDownloads: number;
  conversionRate: number;
  conversionKind: "request" | "download";
};

export type GuideTotals = GuideStats & { openDownloadRate: number };

export type ChannelRow = {
  channel: string;
  requests: number;
  downloaded: number;
  leads: number;
  reachedViewing: number;
};

export type AdminGuide = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  audience: string;
  summary: string;
  benefits: string[];
  coverUrl: string | null;
  pageCount: number | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  gated: boolean;
  ownerId: string | null;
  owner?: { id: string; name: string } | null;
  hasFile: boolean;
  fileName: string | null;
  fileBytes: number | null;
  permitNumber: string | null;
  ctaText: string;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: (GuideStats & { guideId: string }) | null;
};

export const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-[#e6f4ea] text-[#176338]",
  DRAFT: "bg-[#fff4d6] text-[#8a5a00]",
  ARCHIVED: "bg-[#eceff2] text-muted",
};

export const AUDIENCES = ["BUYER", "SELLER", "INVESTOR", "RENTER", "GENERAL"] as const;
export const AUDIENCE_NAME: Record<string, string> = {
  BUYER: "Buyers",
  SELLER: "Sellers",
  INVESTOR: "Investors",
  RENTER: "Renters",
  GENERAL: "General",
};
