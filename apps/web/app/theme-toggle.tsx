"use client";

import { useTheme } from "next-themes";
import { Button } from "@multica/ui/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun01Icon, Moon01Icon } from "@hugeicons/core-free-icons";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="size-8 text-muted-foreground"
    >
      <HugeiconsIcon icon={Sun01Icon} strokeWidth={1.5} className="size-4 dark:hidden" />
      <HugeiconsIcon icon={Moon01Icon} strokeWidth={1.5} className="size-4 hidden dark:block" />
    </Button>
  );
}
