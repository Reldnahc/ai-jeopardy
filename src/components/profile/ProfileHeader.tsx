import Avatar from "../common/Avatar";
import { ProfilePresentation } from "../../utils/profilePresentation.ts";

type RoleInfo = { label: string; className: string } | null;

type Props = {
  pres: ProfilePresentation; // keep your real type if you want
  roleInfo: RoleInfo;
  canShowPromote: boolean;
  canBan: boolean;
  onOpenPromote: () => void;
  onOpenBan: () => void;
};

export default function ProfileHeader({
  pres,
  roleInfo,
  canShowPromote,
  canBan,
  onOpenPromote,
  onOpenBan,
}: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="w-16 h-16 flex-shrink-0">
          <Avatar
            name={pres.avatar.nameForLetter}
            color={pres.avatar.bgColor}
            textColor={pres.avatar.fgColor}
            icon={pres.avatar.icon}
            size="16"
          />
        </div>

        <div>
          <h1
            className={`text-4xl font-bold ${pres.nameClassName}`}
            style={pres.nameStyle ?? { color: "#3b82f6" }}
          >
            {pres.displayName}
          </h1>

          <h3 className="text-black -mt-1 text-sm">
            @{pres.username}
            {roleInfo && (
              <>
                {" "}
                - <span className={`font-semibold ${roleInfo.className}`}>{roleInfo.label}</span>
              </>
            )}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canShowPromote && (
          <button
            type="button"
            onClick={onOpenPromote}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
          >
            Promote
          </button>
        )}

        {canBan && (
          <button
            type="button"
            onClick={onOpenBan}
            className="px-3 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
          >
            Ban
          </button>
        )}
      </div>
    </div>
  );
}
