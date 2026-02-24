import { Link } from "react-router-dom";

export default function DiscoveryLinks() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <Link
        to="/recent-boards"
        className="rounded-2xl border border-slate-200 bg-white/85 p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Explore</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">Recent Boards</p>
        <p className="mt-1 text-slate-600">Browse newly generated games and categories.</p>
      </Link>
      <Link
        to="/leaderboards"
        className="rounded-2xl border border-slate-200 bg-white/85 p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Rank</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">Leaderboards</p>
        <p className="mt-1 text-slate-600">See top players across wins, money, and more.</p>
      </Link>
    </div>
  );
}

