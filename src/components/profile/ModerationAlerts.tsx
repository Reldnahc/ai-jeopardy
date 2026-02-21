import Alert from "../common/Alert";

export default function ModerationAlerts(props: {
  promoteOpen: boolean;
  setPromoteOpen: (v: boolean) => void;
  promoteDraft: string;
  setPromoteDraft: (v: string) => void;
  promotableRolesFiltered: string[];
  prettyRoleLabel: (r: string) => string;
  doPromote: () => Promise<void>;

  banOpen: boolean;
  setBanOpen: (v: boolean) => void;
  banCheck: boolean;
  setBanCheck: (v: boolean) => void;
  doBan: () => Promise<void>;
}) {
  const {
    promoteOpen,
    setPromoteOpen,
    promoteDraft,
    setPromoteDraft,
    promotableRolesFiltered,
    prettyRoleLabel,
    doPromote,
    banOpen,
    setBanOpen,
    banCheck,
    setBanCheck,
    doBan,
  } = props;

  return (
    <>
      <Alert
        isOpen={promoteOpen}
        closeAlert={() => setPromoteOpen(false)}
        text={
          <div className="space-y-3">
            <div className="font-semibold text-gray-900">Promote user</div>
            <div className="text-sm text-gray-600">Promote to the role directly below you.</div>

            <select
              value={promoteDraft}
              onChange={(e) => setPromoteDraft(e.target.value)}
              className="w-full p-2 rounded-md border border-gray-300 text-black bg-white"
            >
              <option value="" disabled>
                Select role…
              </option>

              {promotableRolesFiltered.map((r) => (
                <option key={r} value={r}>
                  {prettyRoleLabel(r)}
                </option>
              ))}
            </select>
          </div>
        }
        buttons={
          promoteDraft
            ? [
                {
                  label: "Cancel",
                  onClick: () => {},
                  styleClass: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
                },
                { label: "OK", onClick: () => void doPromote() },
              ]
            : [
                {
                  label: "Cancel",
                  onClick: () => {},
                  styleClass: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
                },
              ]
        }
      />

      <Alert
        isOpen={banOpen}
        closeAlert={() => setBanOpen(false)}
        text={
          <div className="space-y-3">
            <div className="font-semibold text-gray-900">Ban user</div>
            <div className="text-sm text-gray-600">
              This will set their role to <span className="font-semibold">Banned</span>.
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={banCheck}
                onChange={(e) => setBanCheck(e.target.checked)}
                className="w-4 h-4"
              />
              I understand this action
            </label>
          </div>
        }
        buttons={
          banCheck
            ? [
                {
                  label: "Cancel",
                  onClick: () => {},
                  styleClass: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
                },
                {
                  label: "OK",
                  onClick: () => void doBan(),
                  styleClass: "bg-red-600 text-white hover:bg-red-700",
                },
              ]
            : [
                {
                  label: "Cancel",
                  onClick: () => {},
                  styleClass: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
                },
              ]
        }
      />
    </>
  );
}
