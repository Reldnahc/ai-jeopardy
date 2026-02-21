import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LoadingScreen from "../components/common/LoadingScreen";
import ProfileTabs, { type ProfileTab } from "../components/profile/ProfileTabs";
import ProfileHeader from "../components/profile/ProfileHeader";
import ProfileBioCard from "../components/profile/ProfileBioCard";
import ProfileCustomizationPanel from "../components/profile/ProfileCustomizationPanel";
import ProfileStatsGrid from "../components/profile/ProfileStatsGrid";
import RecentBoards from "../components/profile/RecentBoards";
import ModerationAlerts from "../components/profile/ModerationAlerts";
import {
  prettyRoleLabel,
  useProfilePageController,
} from "../hooks/profile/useProfilePageController";
import type { Role } from "../../shared/roles.ts";

interface RouteParams extends Record<string, string | undefined> {
  username: string;
}

const Profile: React.FC = () => {
  const { username } = useParams<RouteParams>();
  const c = useProfilePageController(username);

  const [activeTab, setActiveTab] = useState<string>("profile");

  const tabs: ProfileTab[] = useMemo(
    () => [
      { key: "profile", label: "Profile" },
      { key: "customization", label: "Customization" },
      // add third later: { key: "whatever", label: "Whatever" }
    ],
    [],
  );

  // If you're viewing someone else's profile, never allow the customization tab
  useEffect(() => {
    if (!c.isOwnProfile && activeTab !== "profile") {
      setActiveTab("profile");
    }
  }, [c.isOwnProfile, activeTab]);

  // ---- Render guards ----
  if (!c.routeProfile && (c.routeLoading || c.loading) && !c.routeGaveUp) {
    return <LoadingScreen message="Loading profile" progress={-1} />;
  }

  if (!c.routeProfile && c.routeGaveUp) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-6">
          <div className="text-xl font-semibold text-gray-900">Couldn’t load profile</div>
          <div className="mt-2 text-sm text-red-600">{c.routeError ?? "Unknown error"}</div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
              onClick={() => c.retry()}
            >
              Retry
            </button>

            <Link
              to="/"
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!c.routeProfile || !c.pres) {
    return <LoadingScreen message="Loading profile" progress={-1} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6">
        <div className="space-y-6">
          {/* Tabs only on your own profile */}
          {c.isOwnProfile && (
            <ProfileTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
          )}

          <ProfileHeader
            pres={c.pres}
            roleInfo={c.roleInfo}
            canShowPromote={c.canShowPromote}
            canBan={c.canBan}
            onOpenPromote={() => {
              c.setPromoteDraft("");
              c.setPromoteOpen(true);
            }}
            onOpenBan={() => {
              c.setBanCheck(false);
              c.setBanOpen(true);
            }}
          />

          {/* Profile section always shows */}
          {activeTab === "profile" && (
            <div className="space-y-8">
              <ProfileBioCard
                bio={c.routeProfile.bio}
                isOwnProfile={c.isOwnProfile}
                token={c.token}
                bioDraft={c.bioDraft}
                setBioDraft={c.setBioDraft}
                savingBio={c.savingBio}
                setSavingBio={c.setSavingBio}
                onSaveBio={async (nextBio) => c.saveCustomization({ bio: nextBio })}
                canModerate={c.canModerate}
                onDeleteBio={c.doDeleteBio}
                localError={c.localError}
                boardsLoading={c.boardsLoading}
              />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-semibold text-gray-800">Player Stats</h2>

                  <Link
                    to={`/profile/${c.routeProfile.username}/stats`}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                  >
                    View full stats
                  </Link>
                </div>

                <ProfileStatsGrid
                  boardsGenerated={c.routeProfile.boards_generated}
                  gamesFinished={c.routeProfile.games_finished}
                  gamesWon={c.routeProfile.games_won}
                  moneyWon={c.routeProfile.money_won}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-semibold text-gray-800">
                    Recently Generated Boards
                  </h2>

                  <Link
                    to={`/profile/${c.routeProfile.username}/history`}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                  >
                    View full history
                  </Link>
                </div>

                <RecentBoards boardsLoading={c.boardsLoading} boards={c.boards} />
              </div>
            </div>
          )}

          {/* Customization only exists if it's your profile */}
          {c.isOwnProfile && activeTab === "customization" && (
            <ProfileCustomizationPanel
              token={c.token}
              routeProfile={c.routeProfile}
              pres={c.pres}
              colorTarget={c.colorTarget}
              setColorTarget={c.setColorTarget}
              hexDraft={c.hexDraft}
              setHexDraft={c.setHexDraft}
              cancelHexDraft={c.cancelHexDraft}
              commitHexDraft={c.commitHexDraft}
              saveCustomization={c.saveCustomization}
              nameHexForFontPreview={c.nameHexForFontPreview}
            />
          )}

          <ModerationAlerts
            promoteOpen={c.promoteOpen}
            setPromoteOpen={c.setPromoteOpen}
            promoteDraft={String(c.promoteDraft)}
            setPromoteDraft={(v) => c.setPromoteDraft(v as Role)}
            promotableRolesFiltered={c.promotableRolesFiltered}
            prettyRoleLabel={prettyRoleLabel}
            doPromote={c.doPromote}
            banOpen={c.banOpen}
            setBanOpen={c.setBanOpen}
            banCheck={c.banCheck}
            setBanCheck={c.setBanCheck}
            doBan={c.doBan}
          />

          {c.error && (
            <div className="text-xs text-gray-500">Session profile warning: {c.error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
