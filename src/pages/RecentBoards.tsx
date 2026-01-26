import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import GameCard from "../components/recentboards/GameCard";
import { Board } from "../types/Board.ts";
import { supabase } from "../supabaseClient.ts";
import {models} from "../../shared/models.js";

const RecentBoards = () => {
    const [boards, setBoards] = useState<Board[]>([]); // Holds the list of fetched boards
    const [loading, setLoading] = useState(false); // Controls request throttling
    const [hasMoreBoards, setHasMoreBoards] = useState(true); // Stops loading if no more data
    const [filterModel, setFilterModel] = useState<string | null>(null); // Currently selected model filter
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    // Fetch boards from Supabase with optional filter
    const fetchBoards = async (offset: number = 0, limit: number = 10) => {
        if (loading || !hasMoreBoards) return;
        setLoading(true);

        let query = supabase
            .from("jeopardy_boards") // Replace with your actual table name
            .select("board") // Fetch only the 'board' column
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        // Apply filter if a specific model is selected
        if (filterModel) {
            query = query.eq("board->>model", filterModel); // Adjust according to your JSON structure
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching boards:", error.message);
        } else if (data) {
            const newBoards = data.map(({ board }) => board);
            setBoards((prevBoards) => [...prevBoards, ...newBoards]);

            // If the response contains fewer than the limit, we've reached the end
            if (data.length < limit) {
                setHasMoreBoards(false);
            }
        } else {
            setHasMoreBoards(false);
        }
        setLoading(false);
    };

    // Reset boards and fetch filtered data whenever the filter changes
    useEffect(() => {
        setBoards([]); // Clear previous boards
        setHasMoreBoards(true); // Reset scrollable flag
        fetchBoards(0); // Fetch new boards with the current filter
    }, [filterModel]);

    // Infinite scrolling logic
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMoreBoards && !loading) {
                    fetchBoards(boards.length);
                }
            },
            { threshold: 1.0 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => {
            if (loadMoreRef.current) {
                observer.unobserve(loadMoreRef.current);
            }
        };
    }, [boards.length, loading, hasMoreBoards]);

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex flex-col items-center p-6">


            {/* Boards Display */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl"
            >
                <div className="p-10">
                    <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center">
                        Recent Boards
                    </h1>
                    {/* Filter Buttons */}
                    <div className="flex flex-wrap gap-4 justify-center mb-6">
                        {models.map((model) => (
                            <button
                                key={model.value}
                                onClick={() => setFilterModel(model.value === filterModel ? null : model.value)}
                                className={`px-4 py-2 rounded-full transition-all duration-300 text-sm sm:text-base font-semibold shadow-md ${
                                    filterModel === model.value
                                        ? "bg-blue-500 text-white border border-blue-600 scale-105 ring-2 ring-blue-300"
                                        : "bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105"
                                }`}
                            >
                                {model.label}
                            </button>
                        ))}
                        {/* Clear Filter Button */}
                        <button
                            onClick={() => setFilterModel(null)}
                            className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-md hover:scale-105 transition-all duration-300 text-sm sm:text-base font-semibold"
                        >
                            Clear Filter
                        </button>
                    </div>


                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {boards.map((game, idx) => (
                            <GameCard key={idx} game={game} />
                        ))}
                    </div>
                    {loading && (
                        <div className="text-center text-gray-700 my-4 italic">
                            Loading more boards...
                        </div>
                    )}
                    {!hasMoreBoards && !loading && (
                        <div className="text-center text-gray-700 my-4 italic">
                            No more boards to load.
                        </div>
                    )}
                    {/* Dummy div to trigger infinite scroll */}
                    <div ref={loadMoreRef} className="h-12"></div>
                </div>
            </motion.div>
        </div>
    );
};

export default RecentBoards;