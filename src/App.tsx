/**
 * App.tsx — Naqd GST (standalone, no ERPNext, no login).
 * Clean light dashboard: client list → client detail (returns / reports / compare).
 */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { HiOutlineMoon, HiOutlineSun } from "react-icons/hi2";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import Home from "./pages/Home";
import ClientDetail from "./pages/ClientDetail";

function Header() {
    const { theme, setTheme } = useTheme();
    return (
        <header className="sticky top-0 z-30" style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: "var(--color-primary)" }}>N</span>
                    <span className="font-bold text-[15px]" style={{ color: "var(--color-text)" }}>Naqd <span style={{ color: "var(--color-primary)" }}>GST</span></span>
                </Link>
                <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="btn btn-ghost btn-sm" aria-label="Toggle theme">
                    {theme === "light" ? <HiOutlineMoon className="w-4 h-4" /> : <HiOutlineSun className="w-4 h-4" />}
                </button>
            </div>
        </header>
    );
}

function ThemedToaster() {
    return (
        <Toaster
            position="top-center"
            toastOptions={{
                duration: 3000,
                style: {
                    background: "var(--color-toast-bg)", color: "var(--color-toast-text)",
                    border: "1px solid var(--color-toast-border)", borderRadius: "10px", fontSize: "14px",
                    boxShadow: "var(--shadow-md)",
                },
            }}
        />
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <ThemedToaster />
                <Header />
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/client/:gstin" element={<ClientDetail />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}
