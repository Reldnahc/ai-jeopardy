import React from 'react';
import LockIcon from "../../icons/LockIcon.tsx";
import RedoIcon from "../../icons/RedoIcon.tsx";

interface CategoryBoardProps {
    title: string;
    categories: string[];
    isHost: boolean;
    lockedCategories: boolean[]; // Lock state for each input
    boardType: 'firstBoard' | 'secondBoard';
    onChangeCategory: (
        boardType: 'firstBoard' | 'secondBoard',
        index: number,
        value: string
    ) => void;
    onRandomizeCategory: (
        boardType: 'firstBoard' | 'secondBoard',
        index: number
    ) => void;
    onToggleLock
        : (
        boardType: 'firstBoard' | 'secondBoard',
        index: number
    ) => void;
}

const CategoryBoard: React.FC<CategoryBoardProps> = ({
                                                         title,
                                                         categories,
                                                         isHost,
                                                         lockedCategories,
                                                         boardType,
                                                         onChangeCategory,
                                                         onRandomizeCategory,
                                                         onToggleLock,
                                                     }) => {
    return (
        <div className="min-w-0">
            <h2 className="text-3xl mb-4 text-black font-bold">{title}</h2>
            {categories.map((category, index) => (
                <div key={index} className="flex items-center mb-3 gap-2.5 flex-nowrap">
                    <input
                        id={`${title}-${index}`}
                        type="text"
                        value={category || ''}
                        onChange={(e) => onChangeCategory(boardType, index, e.target.value)}
                        placeholder={`Category ${index + 1}`}
                        className="text-[1.2rem] p-[10px] rounded border text-black bg-gray-50 border-gray-300 flex-1 min-w-0"
                        disabled={lockedCategories[index]} // Disable input if locked
                    />

                    {isHost && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onToggleLock(boardType, index)}
                                disabled={!isHost}
                                className={`text-[1rem] py-[10px] px-[15px] ${
                                    lockedCategories[index] ? 'bg-red-600' : 'bg-indigo-500'
                                } text-white rounded cursor-pointer`}
                            >
                                <LockIcon/>
                            </button>
                            <button
                                onClick={() => onRandomizeCategory(boardType, index)}
                                className="text-[1rem] py-[10px] px-[15px] bg-blue-700 text-white rounded cursor-pointer"
                            >
                                <RedoIcon/>
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};


export default CategoryBoard;
