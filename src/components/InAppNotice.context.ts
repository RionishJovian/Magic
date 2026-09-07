import { createContext, useContext } from "react";
import type { NoticeTone } from "@/lib/notify/tone";

export type InAppNotice = { id: string; tone: NoticeTone; title: string; body?: string };
type NoticeContextValue = {
  pushNotice: (notice: Omit<InAppNotice, "id"> & { id?: string }) => void;
};

export const InAppNoticeContext = createContext<NoticeContextValue | null>(null);

export function useInAppNotice() {
  const context = useContext(InAppNoticeContext);
  if (!context) throw new Error("useInAppNotice must be used inside InAppNoticeProvider");
  return context;
}
