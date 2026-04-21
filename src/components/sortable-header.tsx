"use client";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  column: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (col: string) => void;
  className?: string;
}

export function SortableHeader({
  label, column, currentSort, currentDir, onSort, className = ""
}: SortableHeaderProps) {
  const active = currentSort === column;
  return (
    <th
      className={`cursor-pointer select-none ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1 hover:text-gray-900">
        {label}
        {active ? (
          currentDir === "asc"
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
