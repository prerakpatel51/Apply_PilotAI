import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./Button";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setDark((d) => !d)}
      leftIcon={dark ? <Sun size={16} /> : <Moon size={16} />}
    >
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
