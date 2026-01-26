import React from 'react';
import LockIcon from "../../icons/LockIcon.tsx";
import RedoIcon from "../../icons/RedoIcon.tsx";

interface FinalJeopardyCategoryProps {
    category: string;
    isHost: boolean;
    onChangeCategory: (
        boardType: 'finalJeopardy',
        index: undefined,
        value: string
    ) => void;
    onRandomizeCategory: (boardType: 'finalJeopardy') => void;
    lockedCategories: boolean[]; // Lock state for each input
    onToggleLock
        : (
        boardType: 'finalJeopardy',
        index: number
    ) => void;
}

const FinalJeopardyCategory: React.FC<FinalJeopardyCategoryProps> = ({
                                                                         category,
                                                                         isHost,
                                                                         onChangeCategory,
                                                                         onRandomizeCategory,
                                                                         lockedCategories,
                                                                         onToggleLock,
                                                                     }) => {
    return (
        <div>
            <h2 className="text-3xl -mt-3 text-black font-bold">Final Jeopardy!</h2>
            <div className="flex items-center gap-2.5 flex-1 mt-3 ">
                <input
                    type="text"
                    value={category}
                    disabled={lockedCategories[0]} // Disable input if locked
                    onChange={(e) =>
                        onChangeCategory('finalJeopardy', undefined, e.target.value)
                    }
                    placeholder="Enter Final Jeopardy Category"
                    className="text-[1.2rem] p-[10px] rounded border text-black bg-gray-50 border-gray-300 flex-1 min-w-0"
                />
                {isHost && (
                    <div>
                        <button
                            onClick={() => onToggleLock('finalJeopardy', 0)}
                            disabled={!isHost} // Only the host can toggle locks
                            className={`text-[1rem] py-[10px] px-[15px] ${
                                lockedCategories[0] ? 'bg-red-600' : 'bg-indigo-500'
                            } text-white rounded cursor-pointer mr-2`}
                        >
                            <LockIcon/>
                        </button>
                        <button
                            onClick={() => onRandomizeCategory('finalJeopardy')}
                            className="text-[1rem] py-[10px] px-[15px] bg-blue-700 text-white rounded cursor-pointer"
                        >
                            <RedoIcon/>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FinalJeopardyCategory;
