type Props = {
  title?: string;
  bio: string | null | undefined;

  isOwnProfile: boolean;
  token: string | null | undefined;

  bioDraft: string;
  setBioDraft: (v: string) => void;

  savingBio: boolean;
  setSavingBio: (v: boolean) => void;

  onSaveBio: (nextBio: string | null) => Promise<void>;

  canModerate: boolean;
  onDeleteBio: () => Promise<void>;

  localError: string | null;
  boardsLoading: boolean;
};

export default function ProfileBioCard({
  title = "Bio",
  bio,
  isOwnProfile,
  token,
  bioDraft,
  setBioDraft,
  savingBio,
  setSavingBio,
  onSaveBio,
  canModerate,
  onDeleteBio,
  localError,
  boardsLoading,
}: Props) {
  return (
    <>
      {(localError || boardsLoading) && (
        <div className="text-sm text-red-600">{localError ? localError : null}</div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>

          {canModerate && (
            <button
              type="button"
              onClick={() => void onDeleteBio()}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
              title="Clear this user's bio"
            >
              Delete Bio
            </button>
          )}
        </div>

        {isOwnProfile && token ? (
          <div className="space-y-2">
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Write something about yourself…"
              maxLength={280}
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{bioDraft.length}/280</span>

              <button
                type="button"
                disabled={savingBio}
                onClick={async () => {
                  setSavingBio(true);
                  try {
                    const trimmed = bioDraft.trim();
                    await onSaveBio(trimmed.length ? trimmed : null);
                  } finally {
                    setSavingBio(false);
                  }
                }}
                className="px-3 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                Save Bio
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-700 whitespace-pre-wrap">
            {bio?.trim()?.length ? bio : <span className="italic text-gray-500">No bio yet.</span>}
          </p>
        )}
      </div>
    </>
  );
}
