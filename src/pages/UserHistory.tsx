import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../types/Board";
import Avatar from "../components/common/Avatar";
import LoadingScreen from "../components/common/LoadingScreen";
import ProfileGameCard from "../components/profile/ProfileGameCard";
import { useProfile } from "../contexts/ProfileContext";
import { getProfilePresentation } from "../utils/profilePresentation";
import type { Profile as P } from "../contexts/ProfileContext";

interface RouteParams extends Record<string, string | undefined> {
  username: string;
}

const PAGE_SIZE = 10;

function getApiBase() {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

function normalizeUsername(u: unknown) {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

function toErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function UserHistory() {
  const { username } = useParams<RouteParams>();

  const { fetchPublicProfile } = useProfile();

  const [routeProfile, setRouteProfile] = useState<ReturnType<typeof useProfile>["profile"] | null>(
    null,
  );
  const [boards, setBoards] = useState<Board[]>([]);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [hasMoreBoards, setHasMoreBoards] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Load profile from ProfileContext
  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) return;

    void (async () => {
      setLoadingProfile(true);
      setError(null);
      setBoards([]);
      setHasMoreBoards(true);

      try {
        const p = await fetchPublicProfile(u);
        setRouteProfile(p ?? null);
      } catch (e: unknown) {
        setRouteProfile(null);
        setError(toErrorMessage(e) || "Profile not found.");
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [username, fetchPublicProfile]);

  const fetchSeq = useRef(0);

  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) return;

    const mySeq = ++fetchSeq.current;

    void (async () => {
      setLoadingProfile(true);
      setError(null);
      setBoards([]);
      setHasMoreBoards(true);

      try {
        // 1) try ProfileContext
        let p = (await fetchPublicProfile(u)) as P | null;

        // 2) if it came back null (cache miss / in-flight), hard fetch
        if (!p) {
          const api = getApiBase();
          const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Profile not found.");
          p = (data?.profile ?? null) as P | null;
        }

        if (mySeq !== fetchSeq.current) return;

        if (!p) {
          setRouteProfile(null);
          setError("Profile not found.");
          return;
        }

        setRouteProfile(p);
      } catch (e: unknown) {
        if (mySeq !== fetchSeq.current) return;
        setRouteProfile(null);
        setError(toErrorMessage(e) || "Profile not found.");
      } finally {
        if (mySeq === fetchSeq.current) setLoadingProfile(false);
      }
    })();
  }, [username, fetchPublicProfile]);

  const fetchBoards = async (offset: number) => {
    const u = normalizeUsername(username);
    if (!u) return;
    if (loadingBoards || !hasMoreBoards) return;

    setLoadingBoards(true);

    try {
      const api = getApiBase();
      const res = await fetch(
        `${api}/api/profile/${encodeURIComponent(u)}/boards?offset=${offset}&limit=${PAGE_SIZE}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load boards");

      const newBoards = (data.boards ?? []) as Board[];
      setBoards((prev) => [...prev, ...newBoards]);

      if (newBoards.length < PAGE_SIZE) setHasMoreBoards(false);
    } catch (e: unknown) {
      setError(toErrorMessage(e) || "Failed to load boards.");
      setHasMoreBoards(false);
    } finally {
      setLoadingBoards(false);
    }
  };

  // Initial boards load once profile is ready
  useEffect(() => {
    if (!routeProfile?.id) return;
    void fetchBoards(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProfile?.id]);

  // Infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!hasMoreBoards || loadingBoards) return;
        void fetchBoards(boards.length);
      },
      { threshold: 1.0 },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards.length, hasMoreBoards, loadingBoards, routeProfile?.id]);

  const pres = useMemo(() => {
    return getProfilePresentation({
      profile: routeProfile,
      fallbackName: routeProfile?.displayname || routeProfile?.username || "",
      defaultNameColor: "#111827", // gray-900 for this page
    });
  }, [routeProfile]);

  if (loadingProfile) {
    return <LoadingScreen message="Loading history" progress={-1} />;
  }

  if (error || !routeProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xl text-red-600">{error ?? "Profile not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex flex-col items-center p-6">
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-3xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 flex-shrink-0">
                <Avatar
                  name={pres.avatar.nameForLetter}
                  size="16"
                  color={pres.avatar.bgColor}
                  textColor={pres.avatar.fgColor}
                  icon={pres.avatar.icon}
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Board History</h1>
                <p className="text-gray-600">
                  Generated by{" "}
                  <span className={`font-semibold ${pres.nameClassName}`} style={pres.nameStyle}>
                    {pres.displayName}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to={`/profile/${routeProfile.username}`}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition-colors"
              >
                Back to Profile
              </Link>
            </div>
          </div>

          {/* Boards */}
          <div className="space-y-4">
            {boards.length > 0 ? (
              boards.map((board, idx) => <ProfileGameCard key={`${idx}`} game={board} />)
            ) : (
              <p className="text-gray-600 italic">No boards generated yet.</p>
            )}

            {hasMoreBoards && (
              <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                {loadingBoards ? (
                  <p className="text-gray-600">Loading more…</p>
                ) : (
                  <p className="text-gray-600">Scroll to load more</p>
                )}
              </div>
            )}

            {!hasMoreBoards && boards.length > 0 && (
              <p className="text-gray-600 text-center mt-6">You’ve reached the end.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
