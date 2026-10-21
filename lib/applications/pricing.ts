import { getGuestClient } from "@/lib/supabase/guest-client";
import type { MembershipType, Period } from "@/lib/applications/vaildation";

export interface PricingData {
  people: number;
  base_price: number;
  vat_rate: number;
  vat_amount: number;
  total_price: number;
}

export type PricingResult =
  | { ok: true; data: PricingData }
  | { ok: false; message: string };

/**
 * Calculates official membership pricing using Supabase's calculate_membership_price RPC.
 * The backend is the single source of truth for pricing formulas, tiers, and 14% VAT.
 */
export async function calculateApplicationPricing({
  membershipType,
  period,
  people,
  seasonYear = 2026,
}: {
  membershipType: MembershipType;
  period: Period;
  people: number;
  seasonYear?: number;
}): Promise<PricingResult> {
  if (people < 1 || people > 22) {
    return { ok: false, message: "Headcount must be between 1 and 22 people." };
  }

  try {
    const { data, error } = await getGuestClient().rpc(
      "calculate_membership_price",
      {
        p_membership_type: membershipType,
        p_period: period,
        p_people: people,
        p_season_year: seasonYear,
      },
    );

    if (error) {
      console.warn("Pricing RPC error:", error.code, error.message);
      if (error.message.includes("no price")) {
        return {
          ok: false,
          message: "Pricing is currently unavailable for this membership combination.",
        };
      }
      return {
        ok: false,
        message: "Unable to calculate current pricing.",
      };
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return { ok: false, message: "Pricing details unavailable." };
    }

    const row = data[0];
    return {
      ok: true,
      data: {
        people,
        base_price: Number(row.base_price),
        vat_rate: Number(row.vat_rate),
        vat_amount: Number(row.vat_amount),
        total_price: Number(row.total_price),
      },
    };
  } catch (err) {
    console.error("Pricing calculation failed:", err);
    return {
      ok: false,
      message: "Network error while calculating pricing.",
    };
  }
}
