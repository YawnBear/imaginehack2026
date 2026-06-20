import { getFindings } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import SearchResults from "@/app/components/SearchResults";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const res = await getFindings({ q, page_size: 100 });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Search"
        subtitle="Search every finding across resources, projects, teams, issue types and severity."
      />
      {res.mock && <MockBanner reason={res.error} />}
      <SearchResults findings={res.data.items} initialQuery={q} />
    </div>
  );
}
