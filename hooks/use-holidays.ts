"use client";
import { useEffect, useState } from "react";
import { baseHolidays, type HolidayYear } from "../lib/holidays";

export function useHolidays(years: number[]) {
  const key = [...new Set(years)]
    .filter((year) => year >= 1900 && year <= 2199)
    .sort()
    .join(",");
  const [records, setRecords] = useState<Record<number, HolidayYear>>({}),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    async function refresh() {
      try {
        await Promise.all(
          key
            .split(",")
            .filter(Boolean)
            .map(async (year) => {
              const response = await fetch(`/api/holidays?year=${year}`, {
                signal: controller.signal,
              });
              const result = (await response.json()) as HolidayYear & {
                error?: string;
              };
              if (!response.ok)
                throw new Error(
                  result.error || "Não foi possível atualizar os feriados.",
                );
              if (mounted)
                setRecords((previous) => ({ ...previous, [year]: result }));
            }),
        );
        if (mounted) setError("");
      } catch (reason) {
        if (mounted && reason instanceof Error && reason.name !== "AbortError")
          setError(
            "Não foi possível atualizar a fonte oficial. As regras recorrentes continuam visíveis; o salvamento é conferido pelo servidor.",
          );
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
      controller.abort();
    };
  }, [key, revision]);
  const holidays = key
    .split(",")
    .filter(Boolean)
    .flatMap(
      (year) => records[Number(year)]?.holidays || baseHolidays(Number(year)),
    );
  return {
    holidays,
    records,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}
