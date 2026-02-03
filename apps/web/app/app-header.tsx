"use client";

import {
  useHubInit,
  useGatewayStore,
  useHubStore,
  clearConnection,
} from "@multica/store";
import { Button } from "@multica/ui/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader({ children }: { children: React.ReactNode }) {
  useHubInit();

  const gwState = useGatewayStore((s) => s.connectionState);
  const hubId = useGatewayStore((s) => s.hubId);
  const activeAgentId = useHubStore((s) => s.activeAgentId);
  const isConnected = gwState === "registered" && !!hubId && !!activeAgentId;

  const handleDisconnect = () => {
    useGatewayStore.getState().disconnect();
    useHubStore.getState().reset();
    clearConnection();
  };

  return (
    <>
      <header>
        <div className="flex items-center justify-between px-4 py-2 max-w-4xl mx-auto">
          <div className="flex items-center gap-2.5">
            <img src="/icon.png" alt="Multica" className="size-6 rounded-md" />
            <span className="text-sm tracking-wide font-[family-name:var(--font-brand)]">
              Multica
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="text-xs text-muted-foreground"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
