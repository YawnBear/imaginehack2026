"use client";

// Reviewer-role session context. The active reviewer ROLE is the spine of the
// governance story: a finding only clears once every required role approves, so
// switching roles and approving as each is the "no single team has full context"
// demo. Persisted in localStorage so a refresh keeps the chosen role.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// The 6 backend reviewer roles (ARCHITECTURE.md §4 — exact snake_case enum).
export const REVIEWER_ROLES = [
  "security",
  "devops",
  "application_owner",
  "project_owner",
  "compliance",
  "dba",
] as const;

export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

export const ROLE_LABEL: Record<ReviewerRole, string> = {
  security: "Security",
  devops: "DevOps",
  application_owner: "Application Owner",
  project_owner: "Project Owner",
  compliance: "Compliance",
  dba: "Database Admin",
};

// A one-line description of what each role owns / is accountable for.
export const ROLE_OWNS: Record<ReviewerRole, string> = {
  security: "IAM, public access, encryption posture",
  devops: "compute, networking, infrastructure changes",
  application_owner: "app behaviour & dependent services",
  project_owner: "project budget & business sign-off",
  compliance: "data protection, retention, audit",
  dba: "database engines & encryption at rest",
};

const DEFAULT_ROLE: ReviewerRole = "security";
const STORAGE_KEY = "greenguard.reviewer_role";
const AUTO_APPROVE_KEY = "greenguard.auto_approve";
const DEMO_USER = "Demo Reviewer";

interface SessionValue {
  role: ReviewerRole;
  roleLabel: string;
  reviewerId: string;
  user: string;
  setRole: (role: ReviewerRole) => void;
  // Autonomy toggle. When ON, the approval modal records an `approved`
  // decision for EVERY required reviewer in one action (it still only RECORDS
  // approval — nothing is ever executed). Persisted in localStorage.
  autoApprove: boolean;
  setAutoApprove: (on: boolean) => void;
  reset: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<ReviewerRole>(DEFAULT_ROLE);
  const [autoApprove, setAutoApproveState] = useState<boolean>(false);

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && (REVIEWER_ROLES as readonly string[]).includes(saved)) {
        setRoleState(saved as ReviewerRole);
      }
      if (window.localStorage.getItem(AUTO_APPROVE_KEY) === "true") {
        setAutoApproveState(true);
      }
    } catch {
      /* localStorage unavailable — fall back to default */
    }
  }, []);

  const setRole = useCallback((next: ReviewerRole) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setAutoApprove = useCallback((on: boolean) => {
    setAutoApproveState(on);
    try {
      window.localStorage.setItem(AUTO_APPROVE_KEY, on ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    setRoleState(DEFAULT_ROLE);
    setAutoApproveState(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(AUTO_APPROVE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value: SessionValue = {
    role,
    roleLabel: ROLE_LABEL[role],
    // reviewer_id is derived from the active role, e.g. "demo-security".
    reviewerId: `demo-${role}`,
    user: DEMO_USER,
    setRole,
    autoApprove,
    setAutoApprove,
    reset,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}

// Two-letter avatar initials from the active role.
export function roleInitials(role: ReviewerRole): string {
  const label = ROLE_LABEL[role];
  const parts = label.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}
