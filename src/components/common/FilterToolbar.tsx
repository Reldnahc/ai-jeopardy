import React from "react";

type Option = {
  value: string;
  label: string;
};

type Chip = {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
};

interface FilterToolbarProps {
  selectLabel: string;
  selectValue: string;
  onSelectChange: (value: string) => void;
  selectOptions: Option[];
  searchLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  onReset: () => void;
  resetDisabled?: boolean;
  chips: Chip[];
  summaryText: string;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({
  selectLabel,
  selectValue,
  onSelectChange,
  selectOptions,
  searchLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onReset,
  resetDisabled = false,
  chips,
  summaryText,
}) => {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr,1fr,auto]">
        <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          {selectLabel}
          <select
            value={selectValue}
            onChange={(e) => onSelectChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {selectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          {searchLabel}
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            disabled={resetDisabled}
            className="h-10 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.onClick}
              className={[
                "rounded-full border px-3 py-1 text-xs sm:text-sm font-semibold shadow-sm transition",
                chip.active
                  ? "bg-blue-600 text-white border-blue-700"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200",
              ].join(" ")}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="mt-2 text-right text-sm text-gray-600">{summaryText}</div>
      </div>
    </div>
  );
};

export default FilterToolbar;
