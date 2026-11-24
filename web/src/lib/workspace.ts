"use client";

import { createContext, useContext } from "react";
import { formatMoney, type OrgSettings } from "@/lib/api";

export const WorkspaceContext = createContext<OrgSettings | null>(null);

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function useWorkspaceMoney() {
  const workspace = useWorkspace();
  const currency = workspace?.currencyLabel || workspace?.currencyCode;
  return (value: number) => formatMoney(value, currency);
}
