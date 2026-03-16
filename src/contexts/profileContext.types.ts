import type { ProfileIconName } from "../components/common/profileIcons.tsx";
import type { Role } from "../../shared/roles.ts";

export interface ProfileStats {
  boards_generated?: number | null;
  games_finished?: number | null;
  games_played?: number | null;
  money_won?: number | null;
  games_won?: number | null;

  daily_double_found?: number | null;
  daily_double_correct?: number | null;

  final_jeopardy_participations?: number | null;
  final_jeopardy_corrects?: number | null;

  clues_selected?: number | null;
  times_buzzed?: number | null;
  total_buzzes?: number | null;

  correct_answers?: number | null;
  wrong_answers?: number | null;

  clues_skipped?: number | null;
  true_daily_doubles?: number | null;
}

export interface ProfileCustomization {
  bio?: string | null;
  color?: string | null;
  text_color?: string | null;
  name_color?: string | null;
  border?: string | null;
  border_color?: string | null;
  background?: string | null;
  background_color?: string | null;
  font?: string | null;
  icon?: ProfileIconName | null;
}

export interface Profile extends ProfileCustomization, ProfileStats {
  id: string;
  username: string;
  displayname: string;

  email?: string | null;
  role: Role;
  tokens?: number | null;

  created_at?: string;
  updated_at?: string;
}

export interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  getProfileByUsername: (username: string | null | undefined) => Profile | null;
  fetchPublicProfile: (username: string) => Promise<Profile | null>;
  fetchMeProfile: () => Promise<Profile | null>;
  applyProfilePatch: (patch: Partial<Profile>) => void;
  patchProfileByUsername: (username: string, patch: Partial<Profile>) => void;
  fetchPublicProfiles: (usernames: string[]) => Promise<void>;
  refetchProfile: () => Promise<void>;
  setProfileExplicit: (profile: Profile | null) => void;
}
