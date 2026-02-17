// frontend/pages/UserStats.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import LoadingScreen from "../components/common/LoadingScreen";
import { useProfile } from "../contexts/ProfileContext";
import { getProfilePresentation } from "../utils/profilePresentation";
import type { Profile as P } from "../contexts/ProfileContext";

interface RouteParams extends Record<string, string | undefined> {
    username: string;
}

function getApiBase() {
    if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    return "";
}

function normalizeUsername(u: unknown) {
    return String(u ?? "").trim().toLowerCase();
}

function toErrorMessage(e: unknown) {
    if (e instanceof Error) return e.message;
    return String(e);
}

function fmtInt(n: unknown) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return "0";
    return Math.trunc(v).toLocaleString();
}

function fmtMoney(n: unknown) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return "$0";
    return `$${Math.trunc(v).toLocaleString()}`;
}

const pct = (num?: number | null, den?: number | null) => {
    if (!den || den <= 0) return "—";
    return `${((num ?? 0) / den * 100).toFixed(1)}%`;
};


type StatCard = {
    label: string;
    value: string;
    hint?: string;
};

export default function UserStats() {
    const { username } = useParams<RouteParams>();
    const { fetchPublicProfile } = useProfile();

    const [routeProfile, setRouteProfile] = useState<P | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSeq = useRef(0);

    useEffect(() => {
        const u = normalizeUsername(username);
        if (!u) return;

        const mySeq = ++fetchSeq.current;

        void (async () => {
            setLoadingProfile(true);
            setError(null);

            try {
                // 1) Try ProfileContext cache/fetch
                let p = (await fetchPublicProfile(u)) as P | null;

                // 2) If null (cache miss / already in-flight), hard fetch
                if (!p) {
                    const api = getApiBase();
                    const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}`, { cache: "no-store" });
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

    const pres = useMemo(() => {
        return getProfilePresentation({
            profile: routeProfile,
            fallbackName: routeProfile?.displayname || routeProfile?.username || "",
            defaultNameColor: "#111827",
        });
    }, [routeProfile]);

    const statGroups = useMemo(() => {
        const p = routeProfile;

        const gameplay: StatCard[] = [
            { label: "Games Played", value: fmtInt(p?.games_played), hint: "Total games joined." },
            { label: "Games Finished", value: fmtInt(p?.games_finished), hint: "Games completed to the end." },
            { label: "Games Won", value: fmtInt(p?.games_won), hint: "Games finished in 1st place." },
            { label: "Boards Generated", value: fmtInt(p?.boards_generated), hint: "Jeopardy boards created." },
            { label: "Clues Selected", value: fmtInt(p?.clues_selected), hint: "Clues you chose." },
            { label: "Clues Skipped", value: fmtInt(p?.clues_skipped), hint: "Clues revealed without answering." },
            { label: "Money Won", value: fmtMoney(p?.money_won), hint: "Total in-game winnings." },
        ];

        const accuracy: StatCard[] = [
            { label: "Correct Answers", value: fmtInt(p?.correct_answers), hint: "Clues answered correctly." },
            { label: "Wrong Answers", value: fmtInt(p?.wrong_answers), hint: "Clues answered incorrectly." },
            {
                label: "Answer Accuracy",
                value: pct(
                    p?.correct_answers,
                    (p?.correct_answers ?? 0) + (p?.wrong_answers ?? 0)
                ),
                hint: "Correct ÷ total answers.",
            },
        ];

        const buzzing: StatCard[] = [
            { label: "Times Buzz Won", value: fmtInt(p?.times_buzzed), hint: "Times you buzzed in first." },
            { label: "Total Buzzes", value: fmtInt(p?.total_buzzes), hint: "Total buzzer presses." },
            {
                label: "Buzz Win Rate",
                value: pct(p?.times_buzzed, p?.total_buzzes),
                hint: "Won buzzes ÷ total buzzes.",
            },
        ];

        const dailyDouble: StatCard[] = [
            { label: "Daily Doubles Found", value: fmtInt(p?.daily_double_found), hint: "Daily Doubles you uncovered." },
            { label: "Daily Doubles Correct", value: fmtInt(p?.daily_double_correct), hint: "Daily Doubles answered correctly." },
            { label: "True Daily Doubles", value: fmtInt(p?.true_daily_doubles), hint: "Max-wager Daily Doubles." },
            {
                label: "Daily Double Accuracy",
                value: pct(p?.daily_double_correct, p?.daily_double_found),
                hint: "Correct Daily Doubles ÷ found.",
            },
        ];

        const finalJeopardy: StatCard[] = [
            { label: "FJ Participations", value: fmtInt(p?.final_jeopardy_participations), hint: "Final Jeopardy appearances." },
            { label: "FJ Correct", value: fmtInt(p?.final_jeopardy_corrects), hint: "Final Jeopardy correct responses." },
            {
                label: "FJ Accuracy",
                value: pct(p?.final_jeopardy_corrects, p?.final_jeopardy_participations),
                hint: "Correct FJ ÷ participations.",
            },
        ];


        return [
            { title: "Gameplay", items: gameplay },
            { title: "Accuracy", items: accuracy },
            { title: "Buzzing", items: buzzing },
            { title: "Daily Double", items: dailyDouble },
            { title: "Final Jeopardy", items: finalJeopardy },
        ];
    }, [routeProfile]);

    if (loadingProfile) {
        return <LoadingScreen message="Loading stats" progress={-1} />;
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
                                <h1 className="text-3xl font-bold text-gray-900">Player Stats</h1>
                                <p className="text-gray-600">
                                    Stats for{" "}
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

                    {/* Stat Sections */}
                    <div className="space-y-8">
                        {statGroups.map((group) => (
                            <section key={group.title}>
                                <h2 className="text-2xl font-semibold mb-4 text-gray-800">{group.title}</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {group.items.map((it) => (
                                        <div key={it.label} className="bg-gray-100 p-4 rounded-lg shadow">
                                            <p className="text-gray-800">{it.label}</p>
                                            <p className="text-lg font-semibold text-gray-900">{it.value}</p>
                                            {it.hint ? <p className="text-xs text-gray-500 mt-1">{it.hint}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>

                </div>
            </div>
        </div>
    );
}
