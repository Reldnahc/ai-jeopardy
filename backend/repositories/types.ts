// backend/repositories/board.ts
export type PublicUser = Record<string, unknown>;
export type PublicProfile = Record<string, unknown>;

export type LoginRow = {
  id: string;
  username: string;
  displayname: string;
  role: string;
  password_hash: string;
  // add whatever else your login query returns
};

export interface ProfileRepository {
  // auth
  insertProfile: (
    email: string | null,
    usernameRaw: string,
    displayname: string,
    passwordHash: string,
  ) => Promise<PublicUser | null>;

  getLoginRowByUsername: (username: string) => Promise<LoginRow | null>;
  getPublicUserById: (userId: string) => Promise<PublicUser | null>;

  // profile pages
  getMeProfile: (userId: string) => Promise<PublicProfile | null>;
  searchProfiles: (q: string, limit: number) => Promise<PublicUser[]>;
  getPublicProfileByUsername: (username: string) => Promise<PublicProfile | null>;
  updateCustomization: (
    userId: string,
    color: string | undefined,
    text_color: string | undefined,
  ) => Promise<PublicProfile | null>;
}
