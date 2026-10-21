import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FakeSignButton } from "@/components/esign/fake-sign-button";
import { getFakeProvider } from "@/lib/esign";

export const metadata: Metadata = { title: "Test signing", robots: { index: false } };

/**
 * For automated tests only (ESIGN_PROVIDER=fake): pretend to be each signer
 * in turn. With a real provider, people sign from the provider's email.
 */
export default function FakeSigningPage({ params }: PageProps<"/dev/esign/[requestId]">) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Test signing</h1>
      <p className="text-sm text-muted-foreground">
        Only available with the pretend e-sign provider, for automated tests.
      </p>
      <Suspense fallback={null}>
        <Signers params={params} />
      </Suspense>
    </div>
  );
}

async function Signers({ params }: Pick<PageProps<"/dev/esign/[requestId]">, "params">) {
  const { requestId } = await params;
  const provider = getFakeProvider();
  if (!provider) notFound();
  const request = await provider.describe(requestId).catch(() => null);
  if (!request) notFound();

  return (
    <ul className="flex flex-col gap-2">
      {request.signers.map((signer) => (
        <li
          key={signer.email}
          className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
        >
          <span>
            {signer.name} ({signer.email})
          </span>
          {signer.status === "signed" ? (
            <span className="text-muted-foreground">Signed</span>
          ) : (
            <FakeSignButton requestId={requestId} email={signer.email} name={signer.name} />
          )}
        </li>
      ))}
    </ul>
  );
}
