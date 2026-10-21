"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Chrome's install prompt event; not in TypeScript's DOM types yet. */
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/**
 * How to add the portal to the phone's home screen. Android browsers offer
 * an Install button; on an iPhone it's done from Safari's Share menu.
 */
export function InstallHint() {
  const standalone = useMediaQuery("(display-mode: standalone)");
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return null;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-background p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Smartphone className="size-4 text-primary" aria-hidden />
        Add to your home screen
      </h2>
      {prompt ? (
        <>
          <p className="text-muted-foreground">
            Open the portal like an app, straight from your phone.
          </p>
          <div>
            <Button
              onClick={async () => {
                await prompt.prompt();
                setPrompt(null);
              }}
            >
              Install
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          On an iPhone, open this page in Safari, tap the Share button, then{" "}
          <strong>Add to Home Screen</strong>. On Android, open your browser&apos;s menu and tap{" "}
          <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
    </section>
  );
}
