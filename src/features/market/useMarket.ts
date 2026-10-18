import { useQuery } from "@tanstack/react-query";
import { getForexRates } from "@/lib/api/forex";
import { getNepseIndex, getNepseSnapshot } from "@/lib/api/nepse";

export function useForexRates() {
  return useQuery({
    queryKey: ["forex-rates"],
    queryFn: getForexRates,
    staleTime: 15 * 60 * 1000,
  });
}

export function useNepseIndex() {
  return useQuery({
    queryKey: ["nepse-index"],
    queryFn: getNepseIndex,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useNepseSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["nepse-snapshot"],
    queryFn: getNepseSnapshot,
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
