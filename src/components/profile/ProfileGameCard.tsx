import { useState } from "react";
import { Board } from "../../types/Board";
import CollapsibleCategory from "../recentboards/CollapsibleCategory";

type ProfileGameCardProps = {
    game: Board;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

const ProfileGameCard = ({ game }: ProfileGameCardProps) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [copied, setCopied] = useState(false);

    const toggleCollapse = () => setIsCollapsed(!isCollapsed);

    const onCopyJson = async () => {
        const ok = await copyTextToClipboard(JSON.stringify(game, null, 2));
        if (!ok) return;

        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    return (
        <div className="bg-white border border-gray-200 shadow-md rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-gray-800">
                    Model: <span className="font-normal">{game.model}</span>
                </h2>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onCopyJson}
                        className={`px-4 py-2 font-semibold rounded transition-colors duration-200 ${
                            copied
                                ? "bg-green-600 text-white"
                                : "bg-gray-900 text-white hover:bg-gray-800"
                        }`}
                        type="button"
                    >
                        {copied ? "Copied!" : "Copy JSON"}
                    </button>

                    <button
                        onClick={toggleCollapse}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded transition-colors duration-200 hover:bg-blue-700"
                        type="button"
                    >
                        {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <div className="mt-4 space-y-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">First Board</h3>
                        {game.firstBoard?.categories.map((cat, idx) => (
                            <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
                        ))}
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Second Board</h3>
                        {game.secondBoard?.categories.map((cat, idx) => (
                            <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
                        ))}
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Final Jeopardy</h3>
                        {game.finalJeopardy?.categories.map((cat, idx) => (
                            <CollapsibleCategory
                                key={idx}
                                category={cat.category}
                                values={cat.values.map((value) => ({
                                    value: 0,
                                    question: value.question,
                                    answer: value.answer,
                                }))}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileGameCard;
