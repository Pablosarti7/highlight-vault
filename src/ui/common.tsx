import type { ReactNode } from "react";
export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M6 4.5h12v15l-6-3.8-6 3.8z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 9h6m-6 3h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
export function Icon({
  name,
}: {
  name: "search" | "arrow" | "trash" | "book" | "shield";
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      ) : name === "arrow" ? (
        <>
          <path d="M7 17 17 7M7 7h10v10" />
        </>
      ) : name === "trash" ? (
        <>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
        </>
      ) : name === "shield" ? (
        <>
          <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
          <path d="m8 12 3 3 5-6" />
        </>
      ) : (
        <>
          <path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2" />
        </>
      )}
    </svg>
  );
}
export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <div>
          <h1>Highlight Vault</h1>
          <span>A home for what matters.</span>
        </div>
      </div>
      {children}
    </header>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
