/**
 * Theme Context — manages theme state with CSS custom properties
 * Themes: dark, light, minimal
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "dark" | "light" | "minimal";

interface ThemeContextValue {
    theme: ThemeName;
    setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "light",
    setTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export const THEMES: { name: ThemeName; label: string; emoji: string; preview: [string, string, string] }[] = [
    { name: "dark", label: "Dark", emoji: "🌙", preview: ["#020617", "#1e293b", "#3b82f6"] },
    { name: "light", label: "Light", emoji: "☀️", preview: ["#ffffff", "#f1f5f9", "#3b82f6"] },
    { name: "minimal", label: "Minimal", emoji: "▫️", preview: ["#fafafa", "#ffffff", "#18181b"] },
];

const VALID: ThemeName[] = ["dark", "light", "minimal"];

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeName>(() => {
        // Fall back to dark for removed/unknown saved themes (e.g. old lemonade/ocean)
        const saved = localStorage.getItem("naqdexim-theme");
        return VALID.includes(saved as ThemeName) ? (saved as ThemeName) : "light";
    });

    const setTheme = (t: ThemeName) => {
        setThemeState(t);
        localStorage.setItem("naqdexim-theme", t);
    };

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
