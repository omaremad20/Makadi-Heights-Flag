"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  FileDown,
} from "lucide-react";
import { updateApplicationStatus } from "@/lib/applications/actions";
import { Application, ApplicationStatus } from "@/lib/types/applications";
import { generateApplicationPdf } from "@/lib/applications/pdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ApplicationsClientProps {
  initialApplications: Application[];
  stats: Record<string, number>;
  totalCount: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
  currentStatus: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${colors[status] || colors.cancelled}`}
    >
      {status}
    </span>
  );
}

export default function ApplicationsClient({
  initialApplications,
  stats,
  totalCount,
  totalPages,
  currentPage,
  currentSearch,
  currentStatus,
}: ApplicationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // States
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [draftSearch, setDraftSearch] = useState(currentSearch || "");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftSearch(currentSearch || "");
  }, [currentSearch]);

  // --- Search Logic ---
  const executeSearch = (term: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term.trim()) {
      params.set("search", term.trim());
    } else {
      params.delete("search");
    }
    params.set("page", "1");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch(draftSearch);
    }
  };

  const clearSearch = () => {
    setDraftSearch("");
    executeSearch("");
  };

  // --- Filtering & Pagination ---
  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status !== "all") params.set("status", status);
    else params.delete("status");
    params.set("page", "1");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // --- Mutations ---
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(
    null,
  );

  const handleStatusChange = async (
    id: string,
    newStatus: ApplicationStatus,
  ) => {
    if (updatingStatusId) return;

    if (
      !window.confirm(
        `Are you sure you want to mark this application as ${newStatus}?`,
      )
    ) {
      return;
    }

    try {
      setUpdatingStatusId(id);

      const result = await updateApplicationStatus(id, newStatus);

      if (!result.success) {
        alert(`Failed to update status: ${result.error}`);
        return;
      }

      setSelectedApp((current) =>
        current?.id === id
          ? { ...current, status: result.status }
          : current,
      );

      alert("Status updated successfully.");
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      alert(`Failed to update status: ${message}`);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // --- Individual Document Download Handler ---
  const handleIndividualDownload = async (app: Application) => {
    if (downloadingId) return;

    try {
      setDownloadingId(app.id);

      // Generate the official PDF populated with this application's actual data
      const result = await generateApplicationPdf(app);

      // Trigger browser download of the PDF
      const url = result.url || window.URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (!result.url) {
        window.URL.revokeObjectURL(url);
      }
    } catch (error: unknown) {
      console.error("Document Rendering Error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to generate application PDF: ${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {["total", "pending", "approved", "rejected"].map((stat) => (
          <div
            key={stat}
            onClick={() => stat !== "total" && handleStatusFilter(stat)}
            className={`p-4 bg-white rounded-lg border shadow-sm ${stat !== "total" ? "cursor-pointer hover:border-blue-500 transition-colors" : ""}`}
          >
            <p className="text-sm text-gray-500 capitalize">
              {stat} Applications
            </p>
            <p className="text-2xl font-bold">{stats[stat]}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex flex-1 max-w-lg gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by name, email, or unit..."
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-10 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {draftSearch && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => executeSearch(draftSearch)}
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Search
            </button>
          </div>

          <select
            value={currentStatus}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="border rounded-md px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-medium text-gray-600">Applicant</th>
                <th className="p-4 font-medium text-gray-600">Unit / Type</th>
                <th className="p-4 font-medium text-gray-600">Contact</th>
                <th className="p-4 font-medium text-gray-600">Submitted</th>
                <th className="p-4 font-medium text-gray-600">Status</th>
                <th className="p-4 font-medium text-gray-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y relative">
              {isPending && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-sm z-10">
                  <Loader2 className="animate-spin text-blue-600 h-8 w-8" />
                </div>
              )}
              {initialApplications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No applications found matching your criteria.
                  </td>
                </tr>
              ) : (
                initialApplications.map((app: Application) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <p className="font-medium text-gray-900">
                        {app.full_name}
                      </p>
                      <p className="text-gray-500 text-xs">{app.nationality}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-medium">{app.unit_number}</p>
                      <p className="text-gray-500 text-xs">
                        {app.membership_type || "N/A"}
                      </p>
                    </td>
                    <td className="p-4">
                      <p>{app.email}</p>
                      <p className="text-gray-500 text-xs">{app.mobile}</p>
                    </td>
                    <td className="p-4 text-gray-500">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleIndividualDownload(app)}
                          disabled={downloadingId === app.id}
                          className="text-gray-600 hover:text-blue-600 flex items-center gap-1 disabled:opacity-50"
                          title="Download Application Form"
                        >
                          {downloadingId === app.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileDown className="h-4 w-4" />
                          )}
                          <span className="sr-only">Download</span>
                        </button>

                        <button
                          onClick={() => setSelectedApp(app)}
                          className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" /> Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between text-sm text-gray-600">
          <div>
            Showing{" "}
            <span className="font-medium">
              {totalCount > 0 ? (currentPage - 1) * 20 + 1 : 0}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * 20, totalCount)}
            </span>{" "}
            of <span className="font-medium">{totalCount}</span> results
          </div>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1 || isPending}
              onClick={() => handlePageChange(currentPage - 1)}
              className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              disabled={currentPage >= totalPages || isPending}
              onClick={() => handlePageChange(currentPage + 1)}
              className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Application Review Dialog */}
      {selectedApp && (
        <Dialog
          open={!!selectedApp}
          onOpenChange={(open) => !open && setSelectedApp(null)}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-bold">
                    {selectedApp.full_name}
                  </DialogTitle>
                  <DialogDescription>
                    Application ID: {selectedApp.id}
                  </DialogDescription>
                </div>
                <StatusBadge status={selectedApp.status} />
              </div>
            </DialogHeader>

            <div className="space-y-4 py-3 text-sm">
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-gray-500 text-xs">Unit Number</p>
                  <p className="font-semibold">{selectedApp.unit_number || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Nationality</p>
                  <p className="font-semibold">{selectedApp.nationality || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Date of Birth</p>
                  <p className="font-semibold">{selectedApp.date_of_birth || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">User Type</p>
                  <p className="font-semibold capitalize">
                    {selectedApp.user_type || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Membership Type</p>
                  <p className="font-semibold">
                    {selectedApp.membership_type || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Period</p>
                  <p className="font-semibold capitalize">
                    {selectedApp.period || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Mobile</p>
                  <p className="font-semibold">{selectedApp.mobile || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Email</p>
                  <p className="font-semibold">{selectedApp.email || "—"}</p>
                </div>
              </div>

              {/* Partner Details */}
              {selectedApp.partner_name && (
                <div className="p-3 border rounded-lg space-y-1">
                  <h4 className="font-medium text-gray-900">Partner Details</h4>
                  <p>
                    <span className="text-gray-500">Name:</span> {selectedApp.partner_name}
                  </p>
                  {selectedApp.partner_nationality && (
                    <p>
                      <span className="text-gray-500">Nationality:</span>{" "}
                      {selectedApp.partner_nationality}
                    </p>
                  )}
                  {selectedApp.partner_mobile && (
                    <p>
                      <span className="text-gray-500">Mobile:</span>{" "}
                      {selectedApp.partner_mobile}
                    </p>
                  )}
                </div>
              )}

              {/* Additional Persons */}
              {selectedApp.additional_persons &&
                selectedApp.additional_persons.length > 0 && (
                  <div className="p-3 border rounded-lg space-y-2">
                    <h4 className="font-medium text-gray-900">
                      Additional Members ({selectedApp.additional_persons.length})
                    </h4>
                    <div className="divide-y text-xs">
                      {selectedApp.additional_persons.map((person, idx) => (
                        <div key={idx} className="py-1.5 flex justify-between">
                          <span className="font-medium">
                            {idx + 1}. {String(person.name || person.fullName || person.full_name || "—")}
                          </span>
                          <span className="text-gray-500">
                            {String(person.relative || person.relation || "—")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Status Update Actions */}
              <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                <span className="text-xs text-gray-500">Update Status:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStatusChange(selectedApp.id, "approved")}
                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedApp.id, "rejected")}
                    className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedApp.id, "pending")}
                    className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600 transition"
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setSelectedApp(null)}
              >
                Close
              </Button>
              <Button
                onClick={() => handleIndividualDownload(selectedApp)}
                disabled={downloadingId === selectedApp.id}
                className="gap-2"
              >
                {downloadingId === selectedApp.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Download Application PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
