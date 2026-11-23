import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "@tanstack/react-query";

import { sendReport } from "@/lib/api/readerProfile";
import type { ReportReasonId, ReportTarget } from "./reasons";

/**
 * Send a report from a screen outside Chautari (a profile page). Resolves to
 * the server's thank-you line; errors are ReaderApiError.
 */
export function useSendReport() {
  const { isSignedIn, getToken } = useAuth();
  const mutation = useMutation({
    mutationFn: (args: { target: ReportTarget; reason: ReportReasonId; details: string }) =>
      sendReport(getToken, args.target, args.reason, args.details),
  });
  return { ...mutation, isSignedIn: Boolean(isSignedIn) };
}
