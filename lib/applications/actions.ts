'use server'

import { revalidatePath } from 'next/cache';
import { ApplicationStatus } from '../types/applications';
import { createClient } from '../supabase/server';

const ITEMS_PER_PAGE = 20;

export async function getApplicationsStats() {
  const supabase = await createClient();

  // We use multiple count queries for efficiency
  const statuses = ['pending', 'approved', 'rejected', 'cancelled'];
  const stats: Record<string, number> = { total: 0 };

  for (const status of statuses) {
    const { count, error } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    if (!error) {
      stats[status] = count || 0;
      stats.total += count || 0;
    }
  }
  return stats;
}

export async function getApplications({
  page = 1,
  search = '',
  status = 'all',
  limit = ITEMS_PER_PAGE
}) {
  const supabase = await createClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (search) {
    // Search across relevant text fields
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,unit_number.ilike.%${search}%,mobile.ilike.%${search}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) throw new Error(error.message);

  return {
    applications: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit)
  };
}

export async function updateApplicationStatus(
  id: string,
  newStatus: ApplicationStatus,
): Promise<
  | { success: true; status: ApplicationStatus }
  | { success: false; error: string }
> {
  try {
    const validStatuses: ApplicationStatus[] = [
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ];

    if (!id?.trim()) {
      return { success: false, error: "Application ID is required." };
    }

    if (!validStatuses.includes(newStatus)) {
      return { success: false, error: "Invalid application status." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "You must be logged in to update applications.",
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, approved")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Admin profile lookup failed:", profileError.message);
      return {
        success: false,
        error: "Could not verify your permissions: " + profileError.message,
      };
    }

    if (
      !profile ||
      profile.role !== "admin" ||
      profile.is_active !== true ||
      profile.approved !== true
    ) {
      return {
        success: false,
        error: "You are not authorized to update application statuses. Admin access is required.",
      };
    }

    // Send ONLY the business field `status`.
    // Audit columns and timestamps (updated_at, status_updated_by, etc.)
    // are automatically handled by the database triggers and policies.
    const { data, error } = await supabase
      .from("applications")
      .update({
        status: newStatus,
      })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("Application status update failed:", error.message, error.code);
      if (error.code === "42501") {
        return {
          success: false,
          error: "Permission denied: Database policy does not permit updating this application.",
        };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      return {
        success: false,
        error:
          "No application was updated. Check that the application ID exists.",
      };
    }

    revalidatePath("/dashboard/applications");

    return {
      success: true,
      status: data.status as ApplicationStatus,
    };
  } catch (error: unknown) {
    console.error("Unexpected status update error:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    };
  }
}

export async function exportApplicationsCsv() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  // CSV Generation logic
  const headers = ['ID', 'Date', 'Name', 'Unit', 'Status', 'Email', 'Mobile', 'Type'];
  const rows = (data || []).map(app => [
    app.id,
    new Date(app.created_at).toLocaleDateString(),
    `"${app.full_name}"`,
    `"${app.unit_number}"`,
    app.status,
    app.email,
    app.mobile,
    app.membership_type || 'N/A'
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}