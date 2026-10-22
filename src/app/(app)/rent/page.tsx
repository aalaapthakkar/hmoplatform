import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionView } from "@/components/rent/collection-view";

export const metadata: Metadata = { title: "Rent" };

export default function RentPage({ searchParams }: PageProps<"/rent">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rent</h1>
        <p className="text-muted-foreground">
          Who&apos;s paid, part paid or behind, month by month.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Collection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Collection({ searchParams }: Pick<PageProps<"/rent">, "searchParams">) {
  return <CollectionView basePath="/rent" params={await searchParams} />;
}
