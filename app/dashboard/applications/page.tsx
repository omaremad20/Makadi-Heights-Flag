import ApplicationsClient from '@/components/applications/applications-client';
import { getApplications, getApplicationsStats } from '@/lib/applications/actions';

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  const status = resolvedParams?.status || 'all';

  const [stats, { applications, totalCount, totalPages }] = await Promise.all([
    getApplicationsStats(),
    getApplications({ page, search, status })
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications Management</h1>
          <p className="text-gray-500">Review and manage Makadi Heights Flag applications.</p>
        </div>
      </div>

      <ApplicationsClient
        initialApplications={applications}
        stats={stats}
        totalCount={totalCount}
        totalPages={totalPages}
        currentPage={page}
        currentSearch={search}
        currentStatus={status}
      />
    </div>
  );
}