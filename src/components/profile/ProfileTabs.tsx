export type ProfileTab = {
  key: string;
  label: string;
};

type Props = {
  tabs: ProfileTab[];
  activeKey: string;
  onChange: (key: string) => void;
};

export default function ProfileTabs({ tabs, activeKey, onChange }: Props) {
  return (
    <div className="flex gap-2 border-b border-gray-200 pb-3">
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              "px-4 py-2 rounded-lg font-semibold text-sm transition-colors",
              active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900 hover:bg-gray-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
